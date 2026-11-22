"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { buttonClass, cx } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!dismissed) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [dismissed]);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setShow(false);
      setDeferredPrompt(null);
    }
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-[var(--color-line)] bg-white p-4 shadow-lg sm:left-auto sm:right-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <Download size={20} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">Install Inbox Revenue Intelligence</h3>
          <p className="mt-0.5 text-xs text-stone-500">Add to your home screen for quick access and notifications.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={install} className={buttonClass("primary", "sm")}>Install</button>
            <button onClick={() => { setShow(false); setDismissed(true); }} className={buttonClass("ghost", "sm")}>Not now</button>
          </div>
        </div>
        <button onClick={() => { setShow(false); setDismissed(true); }} className="rounded p-1 text-stone-400 hover:text-stone-600" aria-label="Close">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}