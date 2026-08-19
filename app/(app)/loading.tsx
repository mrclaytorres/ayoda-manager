export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-32 animate-pulse rounded bg-surface-2" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-11 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-11 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}
