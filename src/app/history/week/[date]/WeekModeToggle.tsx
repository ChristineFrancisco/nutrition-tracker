import Link from "next/link";

/**
 * Two-mode toggle for the week view:
 *
 *   - "calendar"  → Monday → Sunday ISO week.
 *   - "trailing"  → the seven days ending yesterday (today is excluded
 *                   because the day is still in progress and the user
 *                   is asking "how was my last completed week").
 *
 * Both modes share the `[date]` URL segment but interpret it
 * differently. The toggle just rebuilds the URL with the matching
 * mode and a sensible default date for that mode:
 *
 *   - Switching to calendar from any state: anchor to today, server
 *     canonicalizes to that week's Monday.
 *   - Switching to trailing: anchor to yesterday so the window's end
 *     date is yesterday — which is the v1 promise of trailing mode.
 *     Past trailing windows can still be reached by editing the URL,
 *     but the toggle itself doesn't try to preserve "where you were"
 *     — clicking the toggle is the user asking for the canonical
 *     view of the other mode.
 *
 * Server component so it can render a real <Link>; no client state
 * needed. The toggle highlights the active mode by ring + bg.
 */
export default function WeekModeToggle({
  mode,
  todayDate,
  yesterdayDate,
}: {
  mode: "calendar" | "trailing";
  todayDate: string; // YYYY-MM-DD
  yesterdayDate: string; // YYYY-MM-DD
}) {
  const calendarHref = `/history/week/${todayDate}`;
  const trailingHref = `/history/week/${yesterdayDate}?mode=trailing`;

  return (
    <div
      role="tablist"
      aria-label="Week view mode"
      className="inline-flex rounded-lg border border-zinc-300 bg-zinc-50 p-0.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900"
    >
      <ToggleLink
        href={calendarHref}
        active={mode === "calendar"}
        label="Mon–Sun"
        sub="Calendar week"
      />
      <ToggleLink
        href={trailingHref}
        active={mode === "trailing"}
        label="Trailing 7"
        sub="Ending yesterday"
      />
    </div>
  );
}

function ToggleLink({
  href,
  active,
  label,
  sub,
}: {
  href: string;
  active: boolean;
  label: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`flex flex-col items-start rounded-md px-3 py-1.5 transition ${
        active
          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] font-normal text-zinc-400">{sub}</span>
    </Link>
  );
}
