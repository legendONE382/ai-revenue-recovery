"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, buttonClass } from "./ui";

const input = "mt-1 block w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm";

export function AccountForm({ name, email }: { name: string | null; email: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Account" hint={email} />
      <div className="grid gap-6 p-5 md:grid-cols-2">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/api/account", "PATCH", { name: String(new FormData(e.currentTarget).get("name")) });
              setMsg("Saved");
              router.refresh();
            } catch (err) {
              setMsg(err instanceof Error ? err.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-medium">Your name<input name="name" defaultValue={name ?? ""} required className={input} /></label>
          <div className="flex items-center gap-3"><button disabled={busy} className={buttonClass("primary", "sm")}>Save</button>{msg && <span className="text-xs text-stone-600">{msg}</span>}</div>
        </form>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            if (f.get("newPassword") !== f.get("confirm")) return setPwMsg("New passwords don't match");
            setBusy(true);
            try {
              await api("/api/account", "PATCH", { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") });
              setPwMsg("Password changed. Other devices were signed out.");
              form.reset();
            } catch (err) {
              setPwMsg(err instanceof Error ? err.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-medium">Current password<input name="currentPassword" type="password" required autoComplete="current-password" className={input} /></label>
          <label className="block text-sm font-medium">New password<input name="newPassword" type="password" required minLength={10} autoComplete="new-password" className={input} /></label>
          <label className="block text-sm font-medium">Confirm new password<input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={input} /></label>
          <div className="flex items-center gap-3"><button disabled={busy} className={buttonClass("secondary", "sm")}>Change password</button>{pwMsg && <span className="text-xs text-stone-600">{pwMsg}</span>}</div>
        </form>
      </div>
    </Card>
  );
}
