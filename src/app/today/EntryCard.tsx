"use client";

import { useState } from "react";
import DeleteEntryButton from "./DeleteEntryButton";
import RetryAnalyzeButton from "./RetryAnalyzeButton";
import type { EntryRow } from "@/lib/entries";

/**
 * One entry tile on the Today grid. Client component so we can manage
 * a single `expanded` state per card — clicking the footer "Expand"
 * button un-clamps all the card's text blocks at once (model_notes,
 * rejection_reason, user_note). Collapsed is the default, matching the
 * tight grid layout.
 *
 * The button is only rendered when there's actually expandable text;
 * otherwise there's nothing to toggle and the chrome would just be
 * noise.
 */
export default function EntryCard({ entry }: { entry: EntryRow }) {
  const [expanded, setExpanded] = useState(false);

  const timeLabel = new Date(entry.eaten_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const clamp2 = expanded ? "" : "line-clamp-2";
  const clamp3 = expanded ? "" : "line-clamp-3";

  const hasExpandableText = Boolean(
    (entry.status === "rejected" && entry.rejection_reason) ||
      ((entry.status === "analyzed" || entry.status === "failed") &&
        entry.model_notes) ||
      entry.user_note,
  );

  return (
    <li className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-950">
        {entry.photo_url ? (
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

        {hasExpandableText && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
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
