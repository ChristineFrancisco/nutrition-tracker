"use client";

import { useEffect, useRef } from "react";
import { saveTimezone } from "@/app/_actions/timezone";

/**
 * On mount, posts the browser's IANA timezone to the server if it
 * differs from what's already on the profile. The result drives the
 * day-boundary math on every subsequent page render so "today" matches
 * the user's wall clock instead of the server's (UTC on Vercel).
 *
 * Why a client component: only the browser knows the user's tz. We
 * can't read it server-side from request headers reliably (the
 * Date header is server-formatted; nothing carries the IANA name).
 *
 * Idempotent: takes the current saved value as a prop and no-ops if
 * it already matches the browser's. So mounting on every page is
 * cheap — we only post when there's actually a change.
 */
export default function CaptureTimezone({
  current,
}: {
  current: string | null;
}) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    if (typeof Intl === "undefined") return;
    let browserTz: string;
    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!browserTz || browserTz === current) return;

    sentRef.current = true;
    void saveTimezone(browserTz);
  }, [current]);

  return null;
}
