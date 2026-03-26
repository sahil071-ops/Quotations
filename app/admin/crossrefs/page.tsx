import CrossrefsClientPage from './CrossrefsClientPage';

export default function CrossrefsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Competitor Cross-References</h1>
        <p className="mt-1 text-sm text-gray-500">
          Map competitor part numbers to Axis SKUs for direct lookup during queries.
        </p>
      </div>
      <CrossrefsClientPage />
    </div>
  );
}
