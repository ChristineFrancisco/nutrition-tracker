"use client";

import { useState } from "react";

/**
 * Paragraph-styled button that clamps at `clampLines` lines by default
 * and expands to full text on click. Used on entry cards for
 * `model_notes` and `rejection_reason`, which can run long and get
 * truncated by the 2-line clamp in the default card layout.
 *
 * Rendered as a <button> (not a <p>) so it's keyboard-focusable and
 * announces as interactive to screen readers. Visual styling still
 * matches a paragraph.
 */
export default function ExpandableText({
  text,
  className = "",
  clampLines = 2,
}: {
  text: string;
  className?: string;
  clampLines?: 2 | 3;
}) {
  const [expanded, setExpanded] = useState(false);
  const clampClass = clampLines === 3 ? "line-clamp-3" : "line-clamp-2";
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      title={expanded ? "Click to collapse" : "Click to expand"}
      className={`block w-full cursor-pointer select-text text-left transition hover:text-zinc-900 dark:hover:text-zinc-100 ${
        expanded ? "" : clampClass
      } ${className}`}
    >
      {text}
    </button>
  );
}
