"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on first mount in browsers that support
 * it. The SW itself lives at /public/sw.js — see the comments there for
 * what it does (and deliberately doesn't do).
 *
 * We register only in production builds. In dev mode Next serves
 * uniquely-hashed chunks on every recompile, which would either fight
 * with our cache-first strategy or accumulate unbounded cache entries
 * across HMR reloads. The user can exercise the PWA flow locally with
 * `npm run build && npm run start`.
 *
 * Registration is delayed to the `load` event so it doesn't compete
 * with the initial page paint for main-thread time.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // PWA features degrade silently — the rest of the app is
        // unaffected if registration fails.
        console.warn("Service worker registration failed:", err);
      });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
