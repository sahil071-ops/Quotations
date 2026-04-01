function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
      <div className="h-6 w-6 shrink-0 rounded-full bg-gray-200" />
      <div className="h-4 w-28 shrink-0 rounded bg-gray-200" />
      <div className="h-4 flex-1 rounded bg-gray-200" />
      <div className="hidden h-4 w-20 shrink-0 rounded bg-gray-100 sm:block" />
      <div className="h-5 w-16 shrink-0 rounded-full bg-gray-200" />
      <div className="h-4 w-4 shrink-0 rounded bg-gray-100" />
    </div>
  );
}

export default function SkeletonCard() {
  return <SkeletonRow />;
}

export function SkeletonCardList() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
