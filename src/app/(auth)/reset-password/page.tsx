import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/password-forms";

export const metadata = { title: "Choose a new password — Inbox Revenue Intelligence" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-display mb-1 text-2xl">Choose a new password</h1>
      <p className="mb-6 text-sm text-stone-500">At least 10 characters.</p>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
