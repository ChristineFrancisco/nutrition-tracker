import type { Excess } from "@/lib/totals";

/**
 * Red "Excess intake" callout shown above the existing Watch chip strip
 * on Today and the day-history view. Surfaces ULs that have been
 * crossed for the day.
 *
 * Each row shows the nutrient, the total vs the UL (e.g. "Iron 51 mg
 * of 45 mg upper safe limit"), and a one-line plain-language risk
 * hint pulled from the UL meta. Source-restricted nutrients (niacin,
 * folic acid, magnesium) get an extra muted line noting that
 * supplements drive most of this — relevant because the user's diet
 * alone usually can't push past those limits, so the callout firing
 * almost always means a supplement or fortified product is involved.
 *
 * Design intent: this is not a Watch chip. Watch is amber and means
 * "soft cap exceeded"; Excess is red and means "you've crossed a
 * known-harmful threshold." See plan.md §15 for the full rationale.
 *
 * Returns null when the excesses array is empty so the caller can
 * mount it unconditionally without an outer guard.
 */
export default function ExcessIntakeCallout({
  excesses,
}: {
  excesses: Excess[];
}) {
  if (excesses.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-300 bg-red-50/60 p-4 dark:border-red-500/40 dark:bg-red-500/10"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white dark:bg-red-500"
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
            Excess intake
          </p>
          <p className="mt-0.5 text-xs text-red-800/80 dark:text-red-200/80">
            One or more nutrients crossed a known safe-intake ceiling
            today.
          </p>
          <ul className="mt-3 space-y-3">
            {excesses.map((e) => (
              <li
                key={e.key}
                className="border-t border-red-200/70 pt-3 first:border-t-0 first:pt-0 dark:border-red-500/30"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-semibold text-red-900 dark:text-red-100">
                    {e.label}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-red-700 dark:text-red-300">
                    {formatVal(e.total, e.unit)}
                    {" of "}
                    {formatVal(e.limit, e.unit)} upper safe limit
                    {" · "}
                    {e.pct}%
                  </span>
                </div>
                <p className="mt-1 text-xs leading-snug text-red-900/80 dark:text-red-100/80">
                  {e.risk}
                </p>
                {e.source !== "total" && (
                  <p className="mt-1 text-[11px] italic text-red-800/70 dark:text-red-200/70">
                    Supplements and fortified products drive almost all
                    of this — food sources alone usually don&apos;t reach
                    this level.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-red-800/70 dark:text-red-200/70">
            A single high day isn&apos;t usually harmful — the pattern
            over time matters more. Worth checking what drove this
            (especially supplements) and adjusting tomorrow.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatVal(v: number, unit: string): string {
  if (unit === "kcal") return `${Math.round(v).toLocaleString()} kcal`;
  if (v < 10) return `${v.toFixed(1).replace(/\.0$/, "")} ${unit}`;
  return `${Math.round(v).toLocaleString()} ${unit}`;
}
