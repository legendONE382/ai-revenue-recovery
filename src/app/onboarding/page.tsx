import { OnboardingFlow } from "@/components/onboarding-flow";
import { requireAuth } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { googleConfigured } from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <p className="text-sm text-stone-500">Welcome{auth.user.name ? `, ${auth.user.name}` : ""}</p>
      <h1 className="font-display mb-10 mt-1 text-4xl">Let&apos;s set up your workspace</h1>
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-7">
        <OnboardingFlow googleReady={googleConfigured() && isEncryptionConfigured()} demoFirst={sp.demo === "1"} />
      </div>
    </main>
  );
}
