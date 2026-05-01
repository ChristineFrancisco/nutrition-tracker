"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Avatar-button + dropdown that consolidates the account chrome
 * (Goals, Profile, Sign out) into a single nav slot. Replaces three
 * separate header buttons with one consistent affordance, freeing the
 * top strip for temporal navigation (Yesterday / Week / Month).
 *
 * Closes on:
 *   - Click outside the menu
 *   - Escape key
 *   - Clicking any of the menu links (caller-handled via onClick)
 *
 * The Sign-out item stays inside a real form so the existing
 * /auth/signout server action keeps working without JS.
 */
export default function UserMenu({
  initials,
  email,
  displayName,
}: {
  initials: string;
  email: string;
  displayName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:focus:ring-offset-zinc-950"
      >
        {initials || "?"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 origin-top-right overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            {displayName ? (
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                {displayName}
              </p>
            ) : null}
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {email}
            </p>
          </div>
          <MenuLink
            href="/goals"
            label="Goals"
            onSelect={() => setOpen(false)}
          />
          <MenuLink
            href="/profile"
            label="Profile"
            onSelect={() => setOpen(false)}
          />
          <form
            action="/auth/signout"
            method="post"
            className="border-t border-zinc-100 dark:border-zinc-800"
          >
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-red-700 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  label,
  onSelect,
}: {
  href: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="block px-3 py-2 text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {label}
    </Link>
  );
}

/**
 * Compute a 1–2 character initials string from a display name (preferred)
 * or email. Used by the avatar button's label.
 *
 *   "Christine Francisco"      → "CF"
 *   "Christine"                → "CH"
 *   "christine.a.francisco@…"  → "CF"
 *   "christine@…"              → "CH"
 *   ""                         → ""
 */
export { deriveInitials } from "@/lib/initials";
