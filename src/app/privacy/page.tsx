import Link from "next/link";

export const metadata = { title: "Privacy & data handling — Inbox Revenue Intelligence" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-900">
        ← Back
      </Link>
      <h1 className="font-display mt-4 text-4xl">Privacy & data handling</h1>
      <p className="mt-3 text-sm text-stone-500">Operational summary of how this application handles data. A lawyer-reviewed privacy policy is required before public launch (see README › Compliance).</p>
      <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-stone-700">
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">What we access</h2>
          <p>With your permission we use Google&apos;s <code>gmail.readonly</code> scope to read messages and threads from the monitoring window you choose, and <code>gmail.compose</code> solely to create drafts you ask for. We never send email on your behalf.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">What we store</h2>
          <p>Message metadata and the text of conversations that pass our commercial filter. Bodies of newsletters, notifications and spam are not stored. Message bodies are purged after your retention period (default 180 days). OAuth tokens are encrypted with AES-256-GCM using a key held outside the database.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">AI processing</h2>
          <p>By default, analysis is deterministic and runs entirely on our servers. If you enable AI processing, excerpts of ambiguous conversations, drafts context and assistant questions are sent to the AI provider(s) you configure (e.g. Google Gemini, Groq, Mistral). Those providers&apos; data-retention terms apply — free tiers of some providers may use inputs to improve their models. Use your own paid API key if this matters to you.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">Google API Services User Data Policy</h2>
          <p>Use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Gmail data is used only to provide the features you see in this app, is not sold, not used for advertising, and not used to train generalised AI models.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">Your controls</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Disconnect Gmail at any time (revokes our Google access and deletes tokens; optionally purges synced data).</li>
            <li>Export all your data as JSON from Settings.</li>
            <li>Permanently delete your account and every associated record from Settings.</li>
          </ul>
        </section>
        {process.env.CONTACT_EMAIL && (
          <section>
            <h2 className="mb-2 font-semibold text-stone-900">Contact</h2>
            <p>
              Data controller: {process.env.OPERATOR_NAME ?? "the operator of this service"}. Privacy requests: <a className="underline" href={`mailto:${process.env.CONTACT_EMAIL}`}>{process.env.CONTACT_EMAIL}</a>
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
