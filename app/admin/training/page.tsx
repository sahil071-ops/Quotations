import TrainingClientPage from './TrainingClientPage';

export default function TrainingPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Training Data Import</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import historical customer queries and product recommendations to improve AI matching accuracy.
        </p>
      </div>
      <TrainingClientPage />
    </div>
  );
}
