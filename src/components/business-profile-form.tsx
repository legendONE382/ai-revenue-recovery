"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, buttonClass } from "./ui";

type Profile = { id: string; businessName: string | null; businessType: string | null; industry: string | null; description: string | null; preferredCurrency: string | null };
type Offering = { id: string; name: string; category: string | null; active: boolean };

export function BusinessProfileManager() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [facts, setFacts] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const d = await api<{ profile: Profile; offerings: Offering[]; facts: any[] }>("/api/business-profile", "GET");
    setProfile(d.profile);
    setOfferings(d.offerings);
    setFacts(d.facts);
    setName(d.profile.businessName ?? "");
    setDescription(d.profile.description ?? "");
  }
  useEffect(() => {
    let active = true;
    load()
      .then(() => { if (!active) return; })
      .catch((e) => { if (active) setMsg(e.message); });
    return () => { active = false; };
  }, []);

  async function save() {
    try {
      await api("/api/business-profile", "PATCH", { businessName: name, description });
      setMsg("Saved");
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
  }

  async function removeOffering(id: string) {
    await api(`/api/business-profile/offerings?id=${id}`, "DELETE");
    await load();
  }

  async function reviewFact(id: string, action: "confirm" | "reject") {
    await api("/api/business-profile/facts", "PATCH", { id, action });
    await load();
  }

  if (!profile) return <div className="text-sm text-stone-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Business profile" />
        <div className="space-y-3 p-5">
          <label className="block text-sm font-medium">Business name<input className="mt-1 block w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block text-sm font-medium">Description<textarea className="mt-1 block w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div className="flex items-center gap-3">
            <button className={buttonClass("primary", "sm")} onClick={save}>Save</button>
            {msg && <span className="text-xs text-stone-600">{msg}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Offerings" />
        <ul className="divide-y divide-[var(--color-line)]">
          {offerings.map((o) => (
            <li key={o.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>{o.name}{o.category ? ` · ${o.category}` : ""}{o.active ? "" : " (inactive)"}</span>
              <button className="text-stone-500 hover:text-red-600 text-xs" onClick={() => removeOffering(o.id)}>Remove</button>
            </li>
          ))}
          {offerings.length === 0 && <li className="px-5 py-4 text-sm text-stone-500">No offerings yet.</li>}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Discovered business facts" />
        <ul className="divide-y divide-[var(--color-line)]">
          {facts.map((f) => (
            <li key={f.id} className="px-5 py-3 text-sm">
              <div className="font-medium">{f.key}: {f.value} <span className="text-xs text-stone-400">({f.status}, {Math.round(f.confidence * 100)}%)</span></div>
              <div className="mt-1 flex gap-2">
                {f.status !== "confirmed" && <button className="text-xs text-emerald-700" onClick={() => reviewFact(f.id, "confirm")}>Confirm</button>}
                {f.status !== "rejected" && <button className="text-xs text-red-600" onClick={() => reviewFact(f.id, "reject")}>Reject</button>}
              </div>
            </li>
          ))}
          {facts.length === 0 && <li className="px-5 py-4 text-sm text-stone-500">No discovered facts yet.</li>}
        </ul>
      </Card>
    </div>
  );
}