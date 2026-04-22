"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Theme toggle — flips the `.dark` class on <html> and persists the
 * choice in localStorage.
 *
 * On first visit (no stored preference) we defer to the OS's
 * prefers-color-scheme so the initial render matches what the user
 * expects. Once they click the toggle, we store an explicit override.
 *
 * The inline script in app/layout.tsx handles the pre-hydration paint;
 * this component just owns runtime switching.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  // Initialize from whatever the pre-hydration script applied.
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // localStorage unavailable (private mode, etc.) — toggle still
      // works for this session, just won't persist.
    }
  }

  // Render a neutral placeholder before hydration so the button doesn't
  // jump around. aria-hidden until we know the actual theme.
  const label =
    theme === null
      ? "Toggle theme"
      : theme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-white text-base shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      <span aria-hidden>{theme === "dark" ? "☀" : "🌙"}</span>
    </button>
  );
}
