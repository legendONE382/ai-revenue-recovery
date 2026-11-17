"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { buttonClass } from "./ui";

const input = "mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200";

export function ForgotPasswordForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) {
    return (
      <div className="space-y-4 text-sm text-stone-600">
        <p>If an account exists for that address, we&apos;ve sent a link to reset your password. It&apos;s valid for one hour.</p>
        <Link href="/login" className="font-medium text-stone-900 underline">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/forgot", "POST", { email: new FormData(e.currentTarget).get("email") });
          setDone(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
          setBusy(false);
        }
      }}
    >
      {!emailEnabled && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Email delivery isn&apos;t configured on this server, so reset links can&apos;t be sent. Ask the administrator to set RESEND_API_KEY and EMAIL_FROM.</p>}
      <label className="block text-sm font-medium text-stone-700">
        Email
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button disabled={busy || !emailEnabled} className={buttonClass("primary") + " w-full py-2.5"}>{busy ? "Sending…" : "Send reset link"}</button>
      <p className="text-center text-sm text-stone-500"><Link href="/login" className="hover:underline">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!token) return <p className="text-sm text-stone-600">This link is missing its token. <Link href="/forgot-password" className="underline">Request a new one</Link>.</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("password") !== f.get("confirm")) return setError("Passwords don't match");
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/reset", "POST", { token, password: f.get("password") });
          router.push("/app");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong");
          setBusy(false);
        }
      }}
    >
      <label className="block text-sm font-medium text-stone-700">
        New password
        <input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} />
      </label>
      <label className="block text-sm font-medium text-stone-700">
        Confirm new password
        <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={input} />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className={buttonClass("primary") + " w-full py-2.5"}>{busy ? "Saving…" : "Set new password"}</button>
      <p className="text-xs text-stone-500">You&apos;ll be signed out of all other devices.</p>
    </form>
  );
}
