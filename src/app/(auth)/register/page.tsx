import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getAuth()) redirect("/app");
  return (
    <>
      <h1 className="font-display mb-1 text-2xl">Create your account</h1>
      <p className="mb-6 text-sm text-stone-500">Next you&apos;ll connect Gmail — or explore with a sample inbox first.</p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </>
  );
}
