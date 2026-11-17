import { appUrl, emailConfigured } from "./env";

/**
 * Transactional email via the Resend HTTP API (free tier: 3,000 emails/month, 100/day).
 * No SDK dependency. To use another provider (Postmark, SES, SMTP relay), replace `sendEmail` only.
 */
export type EmailMessage = { to: string; subject: string; text: string; html: string };

export async function sendEmail(msg: EmailMessage, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!emailConfigured()) return { sent: false, error: "Email provider not configured" };
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { sent: false, error: `Email provider HTTP ${res.status}` };
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: data.id };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#faf9f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e7e5e0;border-radius:12px;padding:28px">
<tr><td style="font-size:13px;color:#0f5132;font-weight:600;padding-bottom:16px">Inbox Revenue Intelligence</td></tr>
<tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">${esc(title)}</td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#44403c">${bodyHtml}</td></tr>
</table>
<p style="font-size:11px;color:#a8a29e;margin-top:16px">You receive this because you have an account on ${esc(appUrl() ?? "Inbox Revenue Intelligence")}. Manage notifications in Settings.</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#0f5132;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;display:inline-block">${esc(label)}</a></p>`;
}

export function passwordResetEmail(to: string, link: string): EmailMessage {
  return {
    to,
    subject: "Reset your password",
    text: `Someone (hopefully you) asked to reset the password for this account.\n\nReset it here (valid for 1 hour): ${link}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
    html: layout("Reset your password", `<p>Someone (hopefully you) asked to reset the password for this account. The link is valid for 1 hour.</p>${button(link, "Choose a new password")}<p style="color:#78716c;font-size:12px">If you didn't request this, ignore this email — your password won't change.</p>`),
  };
}

export type DigestItem = { title: string; body: string; href: string | null };

/** Notification digest. Contains titles/next actions only — never email bodies. */
export function digestEmail(to: string, items: DigestItem[]): EmailMessage {
  const base = appUrl() ?? "";
  const subject = items.length === 1 ? items[0].title : `${items.length} revenue opportunities need your attention`;
  const text = items.map((i) => `• ${i.title}\n  ${i.body}${i.href ? `\n  ${base}${i.href}` : ""}`).join("\n\n") + `\n\nOpen your dashboard: ${base}/app`;
  const html = layout(
    subject,
    `<ul style="padding-left:18px;margin:0">${items
      .map((i) => `<li style="margin-bottom:12px"><strong>${i.href ? `<a href="${esc(base + i.href)}" style="color:#1c1917">${esc(i.title)}</a>` : esc(i.title)}</strong><br><span style="color:#78716c">${esc(i.body)}</span></li>`)
      .join("")}</ul>${button(`${base}/app`, "Open dashboard")}`,
  );
  return { to, subject, text, html };
}
