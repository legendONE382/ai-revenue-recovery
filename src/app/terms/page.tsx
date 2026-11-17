import Link from "next/link";

export const metadata = { title: "Terms of service — Inbox Revenue Intelligence" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const OPERATOR = process.env.OPERATOR_NAME || "the operator of this service";
  const CONTACT = process.env.CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-900">← Back</Link>
      <h1 className="font-display mt-4 text-4xl">Terms of service</h1>
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Template terms. Have them reviewed by a lawyer for your jurisdiction before public launch.</p>
      <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-stone-700">
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">1. The service</h2>
          <p>Inbox Revenue Intelligence (&ldquo;the service&rdquo;), provided by {OPERATOR}, analyses email conversations you authorise in order to highlight potential commercial opportunities and prepare draft follow-ups. The service is provided in early access, &ldquo;as is&rdquo;.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">2. Your account and mailbox</h2>
          <p>You must only connect mailboxes you are authorised to access, and you are responsible for keeping your credentials secure. You can disconnect mailboxes and delete your account at any time from Settings.</p>
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
          <p>AI-assisted features are disabled unless you enable them. When enabled, parts of your conversations may be processed by third-party AI providers as described in the <Link href="/privacy" className="underline">privacy notice</Link>.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">6. Acceptable use</h2>
          <p>Do not use the service to send unsolicited bulk email, harass recipients, or violate applicable law or Google&apos;s terms.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">7. Liability</h2>
          <p>To the maximum extent permitted by law, {OPERATOR} is not liable for lost revenue, missed opportunities or indirect damages arising from use of, or inability to use, the service.</p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-stone-900">8. Changes and contact</h2>
          <p>These terms may be updated; material changes will be announced in the app. {CONTACT ? <>Questions: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : null}</p>
        </section>
      </div>
    </main>
  );
}
