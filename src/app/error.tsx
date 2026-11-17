"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] error boundary:", error.digest ?? error.message);
  }, [error]);
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <h1 className="font-display text-3xl">Something went wrong</h1>
        <p className="mt-3 max-w-md text-stone-600">The error has been logged. Your data is safe — try again, and if it keeps happening, check the server logs{error.digest ? ` (reference ${error.digest})` : ""}.</p>
        <button onClick={reset} className="mt-6 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white">Try again</button>
      </div>
    </main>
  );
}
