import FeedbackClientPage from './FeedbackClientPage';

export default function FeedbackPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Feedback & Corrections</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review engineer corrections and promote them to the vector index to improve future matching.
        </p>
      </div>
      <FeedbackClientPage />
    </div>
  );
}
