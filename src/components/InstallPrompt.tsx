"use client";

import { useEffect, useState } from "react";

/**
 * Chrome-flavored install-prompt chip.
 *
 * Chromium (Android Chrome, desktop Chrome / Edge / Brave / etc.) fires
 * `beforeinstallprompt` once the page meets installability criteria —
 * served over HTTPS, controlled by a service worker, manifest with
 * required fields, etc. We capture the event, prevent the default
 * mini-infobar from auto-popping, and surface our own chip the user can
 * tap. Tapping it calls `event.prompt()` which opens the native install
 * dialog.
 *
 * iOS Safari never fires this event. iOS users have to install via the
 * share sheet → "Add to Home Screen"; we don't try to teach that pattern
 * in our UI for v1 — most iOS users who install PWAs already know it.
 *
 * The chip auto-hides once the user installs (`appinstalled` event) or
 * dismisses the native dialog. It also doesn't re-mount itself within a
 * session — the browser only fires `beforeinstallprompt` once per page
 * load, so once we've consumed it the chip stays gone.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent || installed) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        // Either way, hide the chip — beforeinstallprompt won't fire
        // again in this session, and the user has already decided.
        setInstallEvent(null);
      }}
      aria-label="Install Nutrition Tracker as an app"
      className="fixed bottom-4 left-4 z-50 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-700/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
    >
      Install app
    </button>
  );
}
