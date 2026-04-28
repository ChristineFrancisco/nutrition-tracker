"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Two-date range picker for /history/range. Renders quick-pick buttons
 * (7d / 30d / This month / Last month) plus from/to date inputs and an
 * Apply button. Submitting navigates to the same page with new ?from
 * and ?to query params; the page is a server component that re-reads
 * those params and re-renders.
 *
 * We deliberately don't validate semantically here (the server page
 * does the canonical bounds checking); the input attributes just stop
 * the user from picking a future date or a from > today, which would
 * 404 on the server anyway.
 */
export default function RangeDatePicker({
  from,
  to,
}: {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}) {
  const router = useRouter();
  const [fromVal, setFromVal] = useState(from);
  const [toVal, setToVal] = useState(to);
  const todayStr = formatLocalDateString(new Date());

  function go(f: string, t: string) {
    router.push(`/history/range?from=${f}&to=${t}`);
  }

  function quickPick(kind: "7d" | "30d" | "thisMonth" | "lastMonth") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let f: Date;
    let t: Date = today;
    if (kind === "7d") {
      f = new Date(today);
      f.setDate(f.getDate() - 6);
    } else if (kind === "30d") {
      f = new Date(today);
      f.setDate(f.getDate() - 29);
    } else if (kind === "thisMonth") {
      f = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
      // lastMonth
      f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      t = new Date(today.getFullYear(), today.getMonth(), 0);
    }
    const fStr = formatLocalDateString(f);
    const tStr = formatLocalDateString(t);
    setFromVal(fStr);
    setToVal(tStr);
    go(fStr, tStr);
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap gap-2">
        <QuickPick label="7 days" onClick={() => quickPick("7d")} />
        <QuickPick label="30 days" onClick={() => quickPick("30d")} />
        <QuickPick label="This month" onClick={() => quickPick("thisMonth")} />
        <QuickPick label="Last month" onClick={() => quickPick("lastMonth")} />
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          go(fromVal, toVal);
        }}
      >
        <label className="flex flex-col text-xs font-medium text-zinc-600 dark:text-zinc-300">
          From
          <input
            type="date"
            value={fromVal}
            max={toVal || todayStr}
            onChange={(e) => setFromVal(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-zinc-600 dark:text-zinc-300">
          To
          <input
            type="date"
            value={toVal}
            min={fromVal}
            max={todayStr}
            onChange={(e) => setToVal(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          Apply
        </button>
      </form>
    </div>
  );
}

function QuickPick({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      {label}
    </button>
  );
}

function formatLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
