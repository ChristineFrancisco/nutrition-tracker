import type { TargetMode } from "@/lib/targets/types";
import { setTargetMode } from "./actions";

/**
 * Three-way segmented control for the user's target mode. Each option
 * is a real <form> with a hidden mode input so the picker keeps working
 * without JS. Active mode is rendered as a filled chip, the other two
 * as ghost buttons.
 *
 * Mode semantics — also documented at the bottom of the picker so the
 * user knows what they're picking:
 *   - generic       FDA Daily Values; doesn't use the profile.
 *   - personalized  DRI minimums for the user's sex + age; uses
 *                   weight/height/activity for calorie + protein math.
 *                   No goal coach.
 *   - custom        Same DRI math as personalized, plus the goal coach
 *                   (weekly weight-change rate + composition focus).
 */
export default function ModePicker({
  current,
}: {
  current: TargetMode;
}) {
  return (
    <div>
      <div className="inline-flex rounded-lg border border-zinc-300 bg-zinc-50 p-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-950">
        <ModeButton
          mode="generic"
          current={current}
          label="FDA generic"
          sub="One-size-fits-all"
        />
        <ModeButton
          mode="personalized"
          current={current}
          label="DRI minimums"
          sub="For your body"
        />
        <ModeButton
          mode="custom"
          current={current}
          label="Customized goal"
          sub="With goal coach"
        />
      </div>
    </div>
  );
}

function ModeButton({
  mode,
  current,
  label,
  sub,
}: {
  mode: TargetMode;
  current: TargetMode;
  label: string;
  sub: string;
}) {
  const active = mode === current;
  return (
    <form action={setTargetMode} className="contents">
      <input type="hidden" name="mode" value={mode} />
      <button
        type="submit"
        aria-pressed={active}
        // Active mode is non-interactive visually (still a button so
        // the form posts, but disabled prevents accidental re-submits
        // and dimming-on-click).
        disabled={active}
        className={`flex flex-col items-start rounded-md px-3 py-1.5 transition ${
          active
            ? "cursor-default bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
      >
        <span className="font-medium">{label}</span>
        <span className="text-[10px] font-normal text-zinc-400">{sub}</span>
      </button>
    </form>
  );
}
