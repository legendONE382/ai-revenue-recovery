"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { buttonClass } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await api(`/api/auth/${mode}`, "POST", { email: f.get("email"), password: f.get("password"), ...(mode === "register" ? { name: f.get("name") || undefined } : {}) });
      router.push(mode === "register" ? `/onboarding${params.get("demo") ? "?demo=1" : ""}` : "/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "register" && (
        <label className="block text-sm font-medium text-stone-700">
          Your name
          <input name="name" autoComplete="name" className={input} placeholder="Alex Morgan" />
        </label>
      )}
      <label className="block text-sm font-medium text-stone-700">
        Email
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="block text-sm font-medium text-stone-700">
        Password
        <input name="password" type="password" required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} className={input} />
        {mode === "register" && <span className="mt-1 block text-xs font-normal text-stone-500">At least 10 characters.</span>}
        {mode === "login" && (
          <Link href="/forgot-password" className="mt-1 block text-right text-xs font-normal text-stone-500 hover:text-stone-900">
            Forgot password?
          </Link>
        )}
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mode === "register" && (
        <p className="text-xs text-stone-500">
          By creating an account you agree to the <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy notice</Link>.
        </p>
      )}
      <button disabled={busy} className={buttonClass("primary") + " w-full py-2.5"}>
        {busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-stone-500">
        {mode === "register" ? (
          <>
            Already have an account? <Link className="font-medium text-stone-900 underline-offset-2 hover:underline" href="/login">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link className="font-medium text-stone-900 underline-offset-2 hover:underline" href="/register">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
