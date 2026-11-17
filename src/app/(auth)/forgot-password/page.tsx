import { ForgotPasswordForm } from "@/components/password-forms";
import { emailConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password — Inbox Revenue Intelligence" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display mb-1 text-2xl">Forgot your password?</h1>
      <p className="mb-6 text-sm text-stone-500">Enter your account email and we&apos;ll send you a reset link.</p>
      <ForgotPasswordForm emailEnabled={emailConfigured()} />
    </>
  );
}
