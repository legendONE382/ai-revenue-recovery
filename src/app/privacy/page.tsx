import Link from "next/link";

export const metadata = { title: "Privacy policy — Inbox Revenue Intelligence" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const OPERATOR = process.env.OPERATOR_NAME || "Inbox Revenue Intelligence";
  const CONTACT = process.env.CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-900">
        ← Back
      </Link>
      <h1 className="font-display mt-4 text-4xl">Privacy policy</h1>
      <p className="mt-3 text-sm text-stone-500">Last updated: November 2026</p>
      <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-stone-700">
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">1. What we collect</h2>
          <p>When you create an account, we collect your name, email address and a hashed password. When you connect a mailbox, we access and store message metadata and the text of conversations that pass our commercial filter, along with extracted signals such as amounts, dates and sender information.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">2. What we access from Gmail</h2>
          <p>With your permission we use Google&apos;s <code>gmail.readonly</code> scope to read messages and threads from the monitoring window you choose, and <code>gmail.compose</code> solely to create drafts you ask for. We never send email on your behalf. Newsletter, notification and spam bodies are never stored.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">3. How we store your data</h2>
          <p>Message bodies are purged after your retention period (default 180 days). OAuth tokens are encrypted with AES-256-GCM using a key held outside the database. All data is scoped to your workspace and never shared with other users.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">4. AI processing</h2>
          <p>By default, analysis is deterministic and runs entirely on our servers. If you enable AI processing, excerpts of ambiguous conversations, drafts context and assistant questions are sent to the AI provider(s) you configure (e.g. Google Gemini, Groq, Mistral, OpenAI). Those providers&apos; data-retention terms apply — free tiers of some providers may use inputs to improve their models. Use your own paid API key if this matters to you. AI processing is off by default and requires explicit opt-in.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">5. Google API Services User Data Policy</h2>
          <p>Use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Gmail data is used only to provide the features you see in this app, is not sold, not used for advertising, and not used to train generalised AI models.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">6. Your controls</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Disconnect Gmail at any time (revokes our Google access and deletes tokens; optionally purges synced data).</li>
            <li>Export all your data as JSON from Settings.</li>
            <li>Permanently delete your account and every associated record from Settings.</li>
            <li>Change your monitoring window, retention period and AI consent at any time from Settings.</li>
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">7. Data retention</h2>
          <p>We retain your account data for as long as your account is active. When you delete your account, all associated records are permanently removed. Message bodies are automatically purged after your configured retention period.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">8. Security</h2>
          <p>We use industry-standard security measures including encrypted credential storage, secure session management, CSRF protection, rate limiting and security headers. However, no method of transmission over the Internet is 100% secure.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">9. Changes to this policy</h2>
          <p>We may update this privacy policy from time to time. Material changes will be announced in the app. Your continued use of the service after changes constitutes acceptance of the updated policy.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">10. Contact</h2>
          <p>Data controller: {OPERATOR}. {CONTACT ? <>Privacy requests and questions: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : "Contact us through the app for privacy-related questions."}</p>
        </section>
      </div>
    </main>
  );
}