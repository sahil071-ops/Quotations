import CategoriesClientPage from './CategoriesClientPage';

export default function CategoriesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Product Categories</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage the hierarchical product categories used for catalog classification.
        </p>
      </div>
      <CategoriesClientPage />
    </div>
  );
}
