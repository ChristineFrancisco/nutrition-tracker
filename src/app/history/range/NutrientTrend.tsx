import type { RangeBucket } from "@/lib/totals";
import {
  NUTRIENT_LABELS,
  NUTRIENT_SEMANTICS,
  type NutrientKey,
} from "@/lib/targets/types";

/**
 * Hand-rolled SVG sparkline for a single nutrient over a range. No
 * charting dep — at this size and complexity it's cheaper to draw the
 * polyline directly than to pull in recharts.
 *
 * Layout:
 *   [Label · avg X unit] [—— sparkline ——] [target tick]
 *
 *   - The label and average sit to the left.
 *   - The sparkline shows one point per day, connected. Days with no
 *     entries (entryCount === 0) are drawn as a gap so the line
 *     doesn't dip to zero and mislead the user about their actual
 *     intake.
 *   - The target line is dashed across the chart at goals[k]. For
 *     ceiling nutrients, points above the line render in red so the
 *     user immediately spots over-budget days.
 *   - Y-axis is auto-scaled to max(values, target) × 1.1 so the line
 *     never crops, but is rounded so the visual is stable across
 *     small daily fluctuations.
 *
 * SVG sizing: 600×40 viewBox, scales with parent width. The wrapper
 * uses a CSS grid to align the columns across multiple trends so they
 * all start at the same x-coordinate.
 */
const PALETTE = {
  line: "#059669", // emerald-600
  area: "#a7f3d0", // emerald-200
  target: "#a1a1aa", // zinc-400
  over: "#dc2626", // red-600
} as const;

const SVG_W = 600;
const SVG_H = 40;
const PAD_TOP = 4;
const PAD_BOTTOM = 4;

export default function NutrientTrend({
  k,
  buckets,
}: {
  k: NutrientKey;
  buckets: RangeBucket[];
}) {
  const meta = NUTRIENT_LABELS[k];
  const semantic = NUTRIENT_SEMANTICS[k];

  // Active days = days the user logged anything. Used to compute avg
  // (averaging zeros from un-logged days is misleading).
  const logged = buckets.filter((b) => b.entryCount > 0);
  const values = logged.map((b) => b.totals[k]);
  const avg =
    logged.length > 0
      ? values.reduce((s, v) => s + v, 0) / logged.length
      : 0;

  // Most-recent goal in the range (stable target line). The actual
  // goal can vary day-to-day, but for the dashed reference we want
  // one stable value so the user reads the line as "this is your
  // target". Falls back to 0 if no goals at all.
  const lastGoals = [...buckets].reverse().find((b) => b.goals !== null)?.goals;
  const target = lastGoals ? lastGoals[k] : 0;

  // Y-axis max. Round up to the nearest "nice" number so the dashed
  // target line lands near a sensible mid-scale tick.
  const maxVal = Math.max(target, ...values, 1);
  const yMax = niceCeil(maxVal * 1.1);

  // X positioning: evenly distribute the buckets across the SVG width
  // so the sparkline reads as one continuous trend.
  const xStep = buckets.length > 1 ? SVG_W / (buckets.length - 1) : 0;
  const yScale = (v: number) =>
    SVG_H -
    PAD_BOTTOM -
    (Math.max(0, v) / yMax) * (SVG_H - PAD_TOP - PAD_BOTTOM);

  // Build polyline path. Un-logged days break the line — we start a new
  // SVG subpath (`M x y`) the next time we hit a logged day instead of
  // letting `L` connect across the gap (which would mislead the user
  // about their actual intake on the empty days).
  let path = "";
  let inGap = true;
  buckets.forEach((b, i) => {
    if (b.entryCount === 0) {
      inGap = true;
      return;
    }
    const x = (i * xStep).toFixed(1);
    const y = yScale(b.totals[k]).toFixed(1);
    if (inGap) {
      path += `${path ? " " : ""}M ${x} ${y}`;
      inGap = false;
    } else {
      path += ` L ${x} ${y}`;
    }
  });

  // Per-day dots, colored red if a ceiling day is over budget.
  const dots = buckets
    .map((b, i) => {
      if (b.entryCount === 0) return null;
      const v = b.totals[k];
      const over =
        semantic === "ceiling" && b.goals && b.goals[k] > 0 && v > b.goals[k];
      return {
        x: i * xStep,
        y: yScale(v),
        over,
      };
    })
    .filter((d): d is { x: number; y: number; over: boolean } => d !== null);

  const targetY = target > 0 ? yScale(target) : null;

  return (
    <div className="grid grid-cols-[8rem_1fr_5rem] items-center gap-3 py-1.5 sm:grid-cols-[10rem_1fr_6rem]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {meta.label}
        </p>
        <p className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          avg {formatVal(avg, meta.unit)}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="h-10 w-full"
        preserveAspectRatio="none"
        aria-label={`${meta.label} trend over range`}
      >
        {/* Soft baseline so the chart has a visible bottom even when
            values are tiny. */}
        <line
          x1="0"
          y1={SVG_H - PAD_BOTTOM}
          x2={SVG_W}
          y2={SVG_H - PAD_BOTTOM}
          stroke={PALETTE.target}
          strokeWidth="0.5"
          opacity="0.3"
        />
        {targetY !== null && (
          <line
            x1="0"
            y1={targetY}
            x2={SVG_W}
            y2={targetY}
            stroke={PALETTE.target}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.6"
          />
        )}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={PALETTE.line}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="2.5"
            fill={d.over ? PALETTE.over : PALETTE.line}
          />
        ))}
      </svg>
      <p className="text-right font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
        {target > 0 ? `goal ${formatVal(target, meta.unit)}` : "—"}
      </p>
    </div>
  );
}

/** Round up to a "nice" number (1, 2, 5 × 10^n). Keeps the y-axis
 *  ceiling stable across small daily fluctuations so the chart doesn't
 *  jiggle as the user changes the range. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const norm = v / base;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function formatVal(v: number, unit: string): string {
  if (unit === "kcal") return `${Math.round(v).toLocaleString()} kcal`;
  if (v < 10) return `${v.toFixed(1).replace(/\.0$/, "")} ${unit}`;
  return `${Math.round(v).toLocaleString()} ${unit}`;
}
