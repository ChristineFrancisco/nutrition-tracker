"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Why isn't X on my targets?" modal for the /goals page. Explains the
 * nutrients that appear on clinical DRI tables (e.g. Health Canada's
 * calculator) but were deliberately left out of this app because a
 * vision model — even paired with a typed description — can't estimate
 * them with enough accuracy to be useful.
 *
 * We group the omissions by *reason* rather than alphabetically so the
 * user can see the pattern: most of these either can't be seen in a
 * photo at all (water, tap-water fluoride, invisible iodized salt) or
 * are already captured by a nutrient we do track (chloride ≈ sodium).
 *
 * Built on the native HTML `<dialog>` element so we don't pull in a
 * dialog library for a single rarely-opened panel. Esc closes the
 * modal for free, focus is trapped inside, and the backdrop click is
 * wired up manually (the platform doesn't do that by default).
 */

type OmittedNutrient = {
  name: string;
  /** Typical reference amount, just to ground "how much is a normal
   *  intake" — not our target, just context. */
  reference: string;
  /** One-sentence explanation of why vision can't estimate it well. */
  reason: string;
};

type Group = {
  title: string;
  /** One-line framing of why this whole bucket is hard. */
  blurb: string;
  nutrients: OmittedNutrient[];
};

const OMITTED_GROUPS: Group[] = [
  {
    title: "Can't be seen in a photo",
    blurb:
      "These are largely invisible — either you drink them or they're hidden inside an ingredient we can't see.",
    nutrients: [
      {
        name: "Water (total fluid)",
        reference: "~2.7 L/day (women), 3.7 L/day (men)",
        reason:
          "A photo of a meal doesn't capture what you drank alongside it, and this app doesn't log beverages separately.",
      },
      {
        name: "Iodine",
        reference: "~150 mcg/day",
        reason:
          "Main sources are iodized salt (invisible), dairy from iodine-supplemented feed, and bread made with iodate dough conditioners. A tuna sandwich can have anywhere from 80 to 800 mcg depending on unseen choices.",
      },
      {
        name: "Fluoride",
        reference: "~3 mg/day",
        reason:
          "About 90% comes from fluoridated tap water, which the app has no way to measure. Food contribution is tiny and highly variable.",
      },
      {
        name: "Chromium",
        reference: "~25–35 mcg/day",
        reason:
          "Trace amounts vary by soil, water, and even cookware (stainless steel leaches small amounts). Nutrient databases disagree on values and a photo gives us no edge.",
      },
    ],
  },
  {
    title: "Already covered by something we track",
    blurb:
      "Tracking these separately would be redundant — their intake moves almost 1:1 with a nutrient already on your list.",
    nutrients: [
      {
        name: "Chloride",
        reference: "~2.3 g/day",
        reason:
          "Nearly all dietary chloride comes from sodium chloride (table salt). If your sodium is in range, chloride is too — it's effectively the same measurement twice.",
      },
    ],
  },
  {
    title: "Trace nutrients you almost certainly hit",
    blurb:
      "Deficiency is essentially unheard of on any mixed diet, and vision can't meaningfully discriminate between foods' contributions.",
    nutrients: [
      {
        name: "Biotin (Vitamin B7)",
        reference: "~30 mcg/day",
        reason:
          "Trace amounts in almost every food; bioavailability shifts with cooking (raw egg whites bind it and block absorption). Clinical deficiency is extremely rare outside specific genetic conditions.",
      },
      {
        name: "Pantothenic acid (Vitamin B5)",
        reference: "~5 mg/day",
        reason:
          "The name literally means \u201Cfrom everywhere\u201D \u2014 it's in virtually all whole foods. Database coverage is spotty and deficiency is functionally nonexistent on a varied diet.",
      },
      {
        name: "Molybdenum",
        reference: "~45 mcg/day",
        reason:
          "Any diet that includes legumes, grains, or nuts covers this several times over. Deficiency in healthy adults is essentially a case-report-level rarity.",
      },
    ],
  },
  {
    title: "Needs precise ingredient knowledge",
    blurb:
      "These are real and matter — we just can't tell from a picture which oil a dish was cooked in or which type of fish it is.",
    nutrients: [
      {
        name: "Linoleic acid (omega-6)",
        reference: "~14–17 g/day",
        reason:
          "A specific fatty acid inside the broader \u201Cfat\u201D number. Splitting it out requires knowing which oil was used (canola vs olive vs butter), which vision generally can't see.",
      },
      {
        name: "\u03B1-Linolenic acid (omega-3)",
        reference: "~1.1–1.6 g/day",
        reason:
          "Same story \u2014 depends on specific oil, nut, seed, or fish species used. Amounts vary by an order of magnitude across plausible dishes that look identical in a photo.",
      },
    ],
  },
];

export default function OmittedNutrientsModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // Keep the React state in sync with the native <dialog> state. The
  // `close` event fires on Esc as well as explicit .close() calls, so
  // we always hear about it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setOpen(false);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  // Close when the user clicks the backdrop (anywhere outside the
  // content box). The dialog element itself fills the viewport; we
  // check that the click target is the dialog, not a descendant.
  function onDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) closeDialog();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden>ⓘ</span>
        Why aren&apos;t iodine, water, etc. on this list?
      </button>

      <dialog
        ref={dialogRef}
        onClick={onDialogClick}
        className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-0 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="max-h-[80vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                Nutrients we don&apos;t estimate
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Clinical DRI tables include a few more nutrients than this
                app does. Each was left out because a vision model (plus a
                typed description) can&apos;t estimate it accurately enough
                to be useful.
              </p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              Close
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {OMITTED_GROUPS.map((group) => (
              <section key={group.title}>
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {group.title}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {group.blurb}
                </p>
                <ul className="mt-2 space-y-2">
                  {group.nutrients.map((n) => (
                    <li
                      key={n.name}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{n.name}</span>
                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {n.reference}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {n.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

        </div>
      </dialog>
    </>
  );
}
