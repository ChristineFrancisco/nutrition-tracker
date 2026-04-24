"use client";

import { useState } from "react";
import DeleteEntryButton from "./DeleteEntryButton";
import RefineEntryForm from "./RefineEntryForm";
import RetryAnalyzeButton from "./RetryAnalyzeButton";
import type { EntryItem, EntryRow } from "@/lib/entries";

/**
 * One entry tile on the Today grid. Client component so we can manage
 * a single `expanded` state per card — clicking the footer "Expand"
 * button un-clamps all the card's text blocks at once (model_notes,
 * rejection_reason, user_note) AND reveals the list of items the AI
 * identified plus a Refine button. Collapsed is the default, matching
 * the tight grid layout.
 *
 * The Refine flow: user reads the item list ("grapefruit, half,
 * high; lemon, 1 whole, low") and realizes the AI counted background
 * decoration as food. They hit Refine, edit the description
 * ("exclude the lemons"), and re-run analysis on the same photo.
 *
 * The expand button is only rendered when there's something worth
 * expanding — status text, user_note, or analyzed items — otherwise
 * the chrome would just be noise.
 */
export default function EntryCard({ entry }: { entry: EntryRow }) {
  const [expanded, setExpanded] = useState(false);
  const [refining, setRefining] = useState(false);

  const timeLabel = new Date(entry.eaten_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const clamp2 = expanded ? "" : "line-clamp-2";
  const clamp3 = expanded ? "" : "line-clamp-3";

  const canRefine =
    entry.status === "analyzed" ||
    entry.status === "rejected" ||
    entry.status === "failed";

  const hasExpandableText = Boolean(
    (entry.status === "rejected" && entry.rejection_reason) ||
      ((entry.status === "analyzed" || entry.status === "failed") &&
        entry.model_notes) ||
      entry.user_note ||
      (entry.status === "analyzed" && entry.items.length > 0),
  );

  return (
    <li className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-950">
        {entry.entry_type === "text" ? (
          // Text-only entry — no image ever existed. Render a labeled
          // placeholder so the grid's square rhythm stays intact and
          // the card is obviously "this one was typed, not snapped".
          // The description itself renders below in the usual user_note
          // block so we don't duplicate it here.
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center">
            <span className="text-2xl" aria-hidden>
              ✍️
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Text entry
            </span>
          </div>
        ) : entry.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.photo_url}
            alt={entry.user_note ?? "Meal photo"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
            photo expired
          </div>
        )}
      </div>

      <div className="space-y-1 p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono text-zinc-500">{timeLabel}</span>
          <StatusBadge status={entry.status} />
        </div>
        {entry.status === "rejected" && entry.rejection_reason && (
          <p className={`text-zinc-500 dark:text-zinc-400 ${clamp2}`}>
            {entry.rejection_reason}
          </p>
        )}
        {entry.status === "analyzed" && entry.model_notes && (
          <p className={`text-zinc-600 dark:text-zinc-400 ${clamp2}`}>
            {entry.model_notes}
          </p>
        )}
        {entry.status === "failed" && (
          <div className="space-y-1.5">
            {entry.model_notes && (
              <p className={`text-red-700 dark:text-red-300 ${clamp3}`}>
                {entry.model_notes}
              </p>
            )}
            <RetryAnalyzeButton entryId={entry.id} />
          </div>
        )}
        {entry.photo_expires_at && entry.photo_url && (
          <p className="text-[10px] text-zinc-400">
            {expiresInLabel(entry.photo_expires_at)}
          </p>
        )}
        {entry.user_note && (
          <p
            className={`border-l-2 border-brand-500/60 pl-2 italic text-zinc-700 dark:border-brand-500/40 dark:text-zinc-300 ${clamp3}`}
          >
            {entry.user_note}
          </p>
        )}

        {/* Items + Refine only show when expanded, to keep the
            collapsed grid tile compact. */}
        {expanded && entry.status === "analyzed" && entry.items.length > 0 && (
          <ItemsList items={entry.items} />
        )}

        {expanded && canRefine && (
          <div className="pt-1">
            {refining ? (
              <RefineEntryForm
                entryId={entry.id}
                currentNote={entry.user_note ?? ""}
                entryType={entry.entry_type}
                onCancel={() => setRefining(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setRefining(true)}
                className="w-full rounded-md border border-brand-500/50 bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-800 transition hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-100 dark:hover:bg-brand-500/20"
              >
                Refine description & re-analyze
              </button>
            )}
          </div>
        )}

        {hasExpandableText && (
          <button
            type="button"
            onClick={() => {
              setExpanded((v) => !v);
              if (expanded) setRefining(false);
            }}
            aria-expanded={expanded}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {expanded ? "Collapse" : "Expand"}
            <span
              aria-hidden
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>
        )}
      </div>

      <DeleteEntryButton entryId={entry.id} />
    </li>
  );
}

/**
 * Per-item list the AI returned. Each row is `name · serving` with a
 * small colored confidence dot at the end. Reasoning (when the model
 * offered one) renders below the row in muted text — good for
 * debugging why the AI thought a lemon was part of the meal.
 */
function ItemsList({ items }: { items: EntryItem[] }) {
  return (
    <div className="space-y-1 rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        What the AI identified
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="space-y-0.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-zinc-800 dark:text-zinc-100">
                  {item.name}
                </span>
                {item.estimated_serving && (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" — "}
                    {item.estimated_serving}
                  </span>
                )}
              </div>
              {item.confidence && <ConfidenceDot level={item.confidence} />}
            </div>
            {item.reasoning && (
              <p className="text-[10px] italic text-zinc-500 dark:text-zinc-400">
                {item.reasoning}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfidenceDot({ level }: { level: "low" | "medium" | "high" }) {
  const color =
    level === "high"
      ? "bg-emerald-500"
      : level === "medium"
        ? "bg-amber-400"
        : "bg-zinc-400";
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400"
      title={`${level} confidence`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      {level}
    </span>
  );
}

function StatusBadge({ status }: { status: EntryRow["status"] }) {
  if (status === "pending") {
    return (
      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
        Analyzing…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-500/20 dark:text-red-200">
        Failed
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
        Not food
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
      Analyzed
    </span>
  );
}

function expiresInLabel(isoExpiresAt: string): string {
  const ms = new Date(isoExpiresAt).getTime() - Date.now();
  if (ms <= 0) return "photo expiring";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `photo will be removed in ${days}d ${hours}h`;
  if (hours > 0) return `photo will be removed in ${hours}h ${minutes}m`;
  return `photo will be removed in ${minutes}m`;
}
