export default function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border-2 border-gray-200 bg-white p-5">
      <div className="mb-3 flex gap-2">
        <div className="h-6 w-6 rounded-full bg-gray-200" />
        <div className="h-6 w-16 rounded bg-gray-200" />
      </div>
      <div className="mb-2 h-6 w-32 rounded bg-gray-200" />
      <div className="mb-2 h-4 w-48 rounded bg-gray-200" />
      <div className="mb-1 h-3 w-24 rounded bg-gray-100" />
      <div className="mb-1 h-3 w-20 rounded bg-gray-100" />
      <div className="mb-4 h-3 w-36 rounded bg-gray-100" />
      <div className="h-3 w-full rounded bg-gray-100" />
    </div>
  );
}

export function SkeletonCardList() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
