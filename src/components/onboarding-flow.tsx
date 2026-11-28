"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Eye, FileEdit, Loader2, Lock, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { buttonClass, cx } from "./ui";

type Offering = { name: string; description: string; category: string; targetCustomer: string; priceRange: string; currency: string; keywords: string };

const BUSINESS_TYPES = ["Freelancer","Agency","Small business","Startup","Consultant","Independent professional","E-commerce business","Retail business","Service business","Other"];
const OBJECTIVES = ["Finding new customers","Recovering sales opportunities","Tracking proposals","Monitoring payments","Managing customer relationships","Tracking business commitments","Identifying important communications"];
const INBOX_PURPOSES = ["Sales and business development","General business communication","Customer support","Finance and billing","Professional correspondence","Mixed usage","Other"];

export function OnboardingFlow({ googleReady, demoFirst }: { googleReady: boolean; demoFirst: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [industry, setIndustry] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");

  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [curOffering, setCurOffering] = useState<Offering>({ name:"", description:"", category:"", targetCustomer:"", priceRange:"", currency:"", keywords:"" });

  const [targetCustomerTypes, setTargetCustomerTypes] = useState("");
  const [targetIndustries, setTargetIndustries] = useState("");
  const [targetMarkets, setTargetMarkets] = useState("");
  const [accepted, setAccepted] = useState("");
  const [excluded, setExcluded] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [inboxPurpose, setInboxPurpose] = useState("");

  const [typicalDealSize, setTypicalDealSize] = useState("");
  const [salesCycle, setSalesCycle] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [tone, setTone] = useState("");
  const [signature, setSignature] = useState("");

  const [days, setDays] = useState(90);
  const [ai, setAi] = useState(false);

  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function saveBusinessProfile() {
    await api("/api/business-profile", "PATCH", {
      businessName: businessName || undefined,
      businessType: businessType || undefined,
      industry: industry || undefined,
      role: role || undefined,
      description: description || undefined,
      website: website || undefined,
      country: country || undefined,
      location: location || undefined,
      timezone: timezone || undefined,
      preferredCurrency: currency || undefined,
      targetCustomerTypes: split(targetCustomerTypes),
      targetIndustries: split(targetIndustries),
      targetMarkets: split(targetMarkets),
      acceptedEnquiryTypes: split(accepted),
      excludedEnquiryTypes: split(excluded),
      businessGoals: goals,
      inboxPurpose: inboxPurpose || undefined,
      typicalDealSize: typicalDealSize || undefined,
      salesCycle: salesCycle || undefined,
      paymentTerms: paymentTerms || undefined,
      businessHours: businessHours || undefined,
      communicationTone: tone || undefined,
      emailSignature: signature || undefined,
      profileStatus: "complete",
    });
    for (const o of offerings) {
      await api("/api/business-profile/offerings", "POST", {
        name: o.name,
        description: o.description || undefined,
        category: o.category || undefined,
        targetCustomer: o.targetCustomer || undefined,
        priceRange: o.priceRange || undefined,
        currency: o.currency || undefined,
        keywords: o.keywords ? split(o.keywords) : [],
      });
    }
  }

  async function savePrefs() {
    await api("/api/settings", "PATCH", { settings: { monitoringDays: days, aiProcessingAllowed: ai, onboardingComplete: true, signature: signature || undefined } });
  }

  async function connectGmail() {
    setBusy("gmail");
    try {
      await saveBusinessProfile();
      await savePrefs();
      window.location.href = "/api/integrations/google/start";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  async function connectDemo() {
    setBusy("demo");
    setError(null);
    try {
      await saveBusinessProfile();
      await savePrefs();
      setProgress(["Preferences saved", "Connecting sample mailbox…"]);
      const r = await api<{ synced: number; analysed: number }>("/api/integrations/demo", "POST", {});
      setProgress((p) => [...p, `Synchronised ${r.synced} messages`, `Analysed ${r.analysed} conversations`, "Opportunities ready"]);
      setTimeout(() => router.push("/app"), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  const steps = ["Permissions", "About business", "Offerings", "Customers & goals", "Operations", "Monitoring & connect"];
  const input = "mt-1 block w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm";

  return (
    <div>
      <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cx("grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold", i < step ? "border-emerald-700 bg-emerald-700 text-white" : i === step ? "border-stone-900 text-stone-900" : "border-stone-300 text-stone-400")}>
              {i < step ? <Check size={12} /> : i + 1}
            </span>
            <span className={i === step ? "font-medium text-stone-900" : "text-stone-500"}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-stone-300" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div>
          <h2 className="font-display text-2xl">What we&apos;ll ask Google for — and why</h2>
          <ul className="mt-5 space-y-4">
            <li className="flex gap-3"><Eye className="mt-0.5 shrink-0 text-stone-600" size={18} /><div><div className="font-medium">Read your email (gmail.readonly)</div><p className="text-sm text-stone-600">Needed to understand whole conversations.</p></div></li>
            <li className="flex gap-3"><FileEdit className="mt-0.5 shrink-0 text-stone-600" size={18} /><div><div className="font-medium">Create drafts (gmail.compose)</div><p className="text-sm text-stone-600">Used only when you click “Create Gmail draft”.</p></div></li>
            <li className="flex gap-3"><Lock className="mt-0.5 shrink-0 text-stone-600" size={18} /><div><div className="font-medium">Your credentials stay server-side</div><p className="text-sm text-stone-600">Tokens encrypted. Newsletter/notification bodies never stored.</p></div></li>
          </ul>
          {!googleReady && <p className="mt-6 flex gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600"><ShieldAlert size={16} className="mt-0.5 shrink-0" />Gmail connection being set up. Explore with sample inbox.</p>}
          <button className={buttonClass("primary") + " mt-7"} onClick={() => setStep(1)}>Continue</button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl">About your business or profession</h2>
          <label className="block text-sm font-medium">Business or professional name<input className={input} value={businessName} onChange={(e)=>setBusinessName(e.target.value)} /></label>
          <label className="block text-sm font-medium">Business type<select className={input} value={businessType} onChange={(e)=>setBusinessType(e.target.value)}><option value="">Select…</option>{BUSINESS_TYPES.map((b)=><option key={b}>{b}</option>)}</select></label>
          <label className="block text-sm font-medium">Industry or profession<input className={input} value={industry} onChange={(e)=>setIndustry(e.target.value)} /></label>
          <label className="block text-sm font-medium">Your role<input className={input} value={role} onChange={(e)=>setRole(e.target.value)} /></label>
          <label className="block text-sm font-medium">Short description<textarea className={input} rows={3} value={description} onChange={(e)=>setDescription(e.target.value)} /></label>
          <label className="block text-sm font-medium">Website (optional)<input className={input} value={website} onChange={(e)=>setWebsite(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Country (optional)<input className={input} value={country} onChange={(e)=>setCountry(e.target.value)} /></label>
            <label className="block text-sm font-medium">Location (optional)<input className={input} value={location} onChange={(e)=>setLocation(e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Timezone<input className={input} value={timezone} onChange={(e)=>setTimezone(e.target.value)} placeholder="Europe/London" /></label>
            <label className="block text-sm font-medium">Preferred currency<input className={input} value={currency} onChange={(e)=>setCurrency(e.target.value)} placeholder="GBP" /></label>
          </div>
          <div className="flex gap-3 pt-2">
            <button className={buttonClass("ghost")} onClick={()=>setStep(0)}>Back</button>
            <button className={buttonClass("primary")} onClick={()=>setStep(2)}>Continue</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl">Products and services</h2>
          <div className="rounded-xl border border-[var(--color-line)] p-4 space-y-3">
            <label className="block text-sm font-medium">Name<input className={input} value={curOffering.name} onChange={(e)=>setCurOffering({...curOffering,name:e.target.value})} /></label>
            <label className="block text-sm font-medium">Description<textarea className={input} rows={2} value={curOffering.description} onChange={(e)=>setCurOffering({...curOffering,description:e.target.value})} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">Category<input className={input} value={curOffering.category} onChange={(e)=>setCurOffering({...curOffering,category:e.target.value})} /></label>
              <label className="block text-sm font-medium">Target customer<input className={input} value={curOffering.targetCustomer} onChange={(e)=>setCurOffering({...curOffering,targetCustomer:e.target.value})} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">Price range (optional)<input className={input} value={curOffering.priceRange} onChange={(e)=>setCurOffering({...curOffering,priceRange:e.target.value})} /></label>
              <label className="block text-sm font-medium">Currency<input className={input} value={curOffering.currency} onChange={(e)=>setCurOffering({...curOffering,currency:e.target.value})} /></label>
            </div>
            <label className="block text-sm font-medium">Keywords (comma separated)<input className={input} value={curOffering.keywords} onChange={(e)=>setCurOffering({...curOffering,keywords:e.target.value})} /></label>
            <button className={buttonClass("secondary")} onClick={() => { if (!curOffering.name) return; setOfferings([...offerings, curOffering]); setCurOffering({ name:"", description:"", category:"", targetCustomer:"", priceRange:"", currency:"", keywords:"" }); }}><Plus size={14} className="mr-1 inline" />Add offering</button>
          </div>
          {offerings.length > 0 && (
            <ul className="space-y-2">
              {offerings.map((o, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm">
                  <span>{o.name}{o.category ? ` · ${o.category}` : ""}</span>
                  <button onClick={() => setOfferings(offerings.filter((_, j) => j !== i))} className="text-stone-500 hover:text-red-600"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-3 pt-2">
            <button className={buttonClass("ghost")} onClick={()=>setStep(1)}>Back</button>
            <button className={buttonClass("primary")} onClick={()=>setStep(3)}>Continue</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl">Ideal customers and business goals</h2>
          <label className="block text-sm font-medium">Target customer types (comma separated)<input className={input} value={targetCustomerTypes} onChange={(e)=>setTargetCustomerTypes(e.target.value)} /></label>
          <label className="block text-sm font-medium">Industries served (comma separated)<input className={input} value={targetIndustries} onChange={(e)=>setTargetIndustries(e.target.value)} /></label>
          <label className="block text-sm font-medium">Geographic markets (comma separated)<input className={input} value={targetMarkets} onChange={(e)=>setTargetMarkets(e.target.value)} /></label>
          <label className="block text-sm font-medium">Enquiry types accepted (comma separated)<input className={input} value={accepted} onChange={(e)=>setAccepted(e.target.value)} /></label>
          <label className="block text-sm font-medium">Enquiry types not handled (comma separated)<input className={input} value={excluded} onChange={(e)=>setExcluded(e.target.value)} /></label>
          <div>
            <div className="text-sm font-medium">Business objectives</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {OBJECTIVES.map((g) => (
                <button key={g} type="button" onClick={() => setGoals(goals.includes(g) ? goals.filter((x)=>x!==g) : [...goals,g])} className={cx("rounded-full border px-3 py-1 text-xs", goals.includes(g) ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-stone-300 text-stone-600")}>{g}</button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-medium">How is this inbox primarily used?<select className={input} value={inboxPurpose} onChange={(e)=>setInboxPurpose(e.target.value)}><option value="">Select…</option>{INBOX_PURPOSES.map((p)=><option key={p}>{p}</option>)}</select></label>
          <div className="flex gap-3 pt-2">
            <button className={buttonClass("ghost")} onClick={()=>setStep(2)}>Back</button>
            <button className={buttonClass("primary")} onClick={()=>setStep(4)}>Continue</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl">Operational preferences</h2>
          <label className="block text-sm font-medium">Typical deal size<input className={input} value={typicalDealSize} onChange={(e)=>setTypicalDealSize(e.target.value)} /></label>
          <label className="block text-sm font-medium">Typical sales cycle<input className={input} value={salesCycle} onChange={(e)=>setSalesCycle(e.target.value)} /></label>
          <label className="block text-sm font-medium">Payment terms<input className={input} value={paymentTerms} onChange={(e)=>setPaymentTerms(e.target.value)} /></label>
          <label className="block text-sm font-medium">Business hours<input className={input} value={businessHours} onChange={(e)=>setBusinessHours(e.target.value)} /></label>
          <label className="block text-sm font-medium">Preferred communication tone<input className={input} value={tone} onChange={(e)=>setTone(e.target.value)} /></label>
          <label className="block text-sm font-medium">Email signature<textarea className={input} rows={3} value={signature} onChange={(e)=>setSignature(e.target.value)} /></label>
          <div className="flex gap-3 pt-2">
            <button className={buttonClass("ghost")} onClick={()=>setStep(3)}>Back</button>
            <button className={buttonClass("primary")} onClick={()=>setStep(5)}>Continue</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div>
          <h2 className="font-display text-2xl">Monitoring and mailbox connection</h2>
          <label className="mt-6 block text-sm font-medium">How far back should we look?
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days (recommended)</option>
              <option value={180}>Last 6 months</option>
              <option value={365}>Last 12 months</option>
            </select>
          </label>
          <div className="mt-6 rounded-xl border border-[var(--color-line)] p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" />
              <span>
                <span className="block text-sm font-medium">Allow AI-assisted analysis with external providers</span>
                <span className="mt-1 block text-sm text-stone-600">Off by default. Detection works without it using deterministic rules.</span>
              </span>
            </label>
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          {progress.length > 0 && <ul className="mt-4 space-y-1 text-sm text-stone-600">{progress.map((p,i)=><li key={i}>{p}</li>)}</ul>}
          <div className="mt-7 flex flex-wrap gap-3">
            <button className={buttonClass("ghost")} onClick={()=>setStep(4)}>Back</button>
            {googleReady && <button className={buttonClass("primary")} disabled={busy !== null} onClick={connectGmail}>{busy === "gmail" ? <Loader2 className="animate-spin" size={16} /> : "Connect Gmail"}</button>}
            <button className={buttonClass("secondary")} disabled={busy !== null} onClick={connectDemo}>{busy === "demo" ? <Loader2 className="animate-spin" size={16} /> : "Use sample inbox"}</button>
          </div>
        </div>
      )}
    </div>
  );
}