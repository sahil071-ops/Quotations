import ProductsClientPage from './ProductsClientPage';

export default function ProductsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Products</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage the Axis product catalog. Re-embed products after editing.
        </p>
      </div>
      <ProductsClientPage />
    </div>
  );
}
