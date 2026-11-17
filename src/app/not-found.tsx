import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-stone-500">404</p>
        <h1 className="font-display mt-2 text-4xl">This page doesn&apos;t exist</h1>
        <p className="mt-3 text-stone-600">It may have been resolved, deleted, or the link is wrong.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/app" className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white">Go to dashboard</Link>
          <Link href="/" className="rounded-lg border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium">Home</Link>
        </div>
      </div>
    </main>
  );
}
