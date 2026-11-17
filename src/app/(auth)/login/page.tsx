import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getAuth()) redirect("/app");
  return (
    <>
      <h1 className="font-display mb-1 text-2xl">Welcome back</h1>
      <p className="mb-6 text-sm text-stone-500">Sign in to your workspace.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
