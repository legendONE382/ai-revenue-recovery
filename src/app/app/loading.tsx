export default function Loading() {
  return (
    <div className="animate-pulse" aria-label="Loading">
      <div className="h-8 w-64 rounded bg-stone-200" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-stone-100" />
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-[var(--color-line)] bg-white" />
        ))}
      </div>
      <div className="mt-6 h-96 rounded-xl border border-[var(--color-line)] bg-white" />
    </div>
  );
}
