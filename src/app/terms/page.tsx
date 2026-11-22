import Link from "next/link";

export const metadata = { 
  title: "Terms of Service — Inbox Revenue Intelligence",
  description: "Terms of service for Inbox Revenue Intelligence. Find revenue opportunities hiding in your inbox with AI-powered email analysis.",
};
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const OPERATOR = process.env.OPERATOR_NAME || "Inbox Revenue Intelligence";
  const CONTACT = process.env.CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-900">
        ← Back
      </Link>
      <h1 className="font-display mt-4 text-4xl">Terms of service</h1>
      <p className="mt-3 text-sm text-stone-500">Last updated: November 2026</p>
      <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-stone-700">
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">1. The service</h2>
          <p>Inbox Revenue Intelligence (&ldquo;the service&rdquo;), provided by {OPERATOR}, analyses email conversations you authorise in order to highlight potential commercial opportunities and prepare draft follow-ups. The service is provided as-is and may be updated or discontinued at any time.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">2. Your account and mailbox</h2>
          <p>You must only connect mailboxes you are authorised to access, and you are responsible for keeping your credentials secure. You can disconnect mailboxes and delete your account at any time from Settings. You are responsible for all activity that occurs under your account.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">3. Findings are suggestions, not facts</h2>
          <p>Findings, amounts, due dates and priorities are derived automatically from email content and may be incomplete or wrong. In particular, an invoice flagged as &ldquo;may be overdue&rdquo; may already have been paid through a channel the service cannot see. Verify information before acting on it. Nothing in the service is financial, legal or accounting advice.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">4. Emails you send</h2>
          <p>The service never sends email on your behalf. Drafts are suggestions; you are solely responsible for reviewing, editing and sending any message.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">5. AI processing</h2>
          <p>AI-assisted features are disabled unless you enable them. When enabled, parts of your conversations may be processed by third-party AI providers as described in the <Link href="/privacy" className="underline">privacy notice</Link>. You are responsible for reviewing provider terms before enabling AI features.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">6. Acceptable use</h2>
          <p>Do not use the service to send unsolicited bulk email, harass recipients, or violate applicable law or Google&apos;s terms. You may not attempt to access other users&apos; data or interfere with the service&apos;s operation.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">7. Intellectual property</h2>
          <p>The service and its original content, features and functionality are owned by {OPERATOR} and are protected by international copyright, trademark and other intellectual property laws.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">8. Limitation of liability</h2>
          <p>To the maximum extent permitted by law, {OPERATOR} is not liable for lost revenue, missed opportunities or indirect damages arising from use of, or inability to use, the service. The service is provided without warranties of any kind.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">9. Termination</h2>
          <p>You may terminate your account at any time by deleting it from Settings. We may suspend or terminate your access if you violate these terms or engage in harmful activity.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">10. Changes and contact</h2>
          <p>These terms may be updated; material changes will be announced in the app. {CONTACT ? <>Questions: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : "Contact us through the app for any questions."}</p>
        </section>
      </div>
    </main>
  );
}