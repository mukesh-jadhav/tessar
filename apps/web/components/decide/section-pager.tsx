"use client";

import { motion } from "motion/react";

/* ---------------------------------------------------------------------------
 * <SectionPager /> — "Next: <label> →" rail at the bottom of each section.
 *
 * Gives the reader a clear train of guidance through the report. Mirrors
 * the editorial feel of long-form publishing where every chapter ends
 * with a pointer to the next.
 * ------------------------------------------------------------------------- */

interface Props {
  prev?: { label: string; onClick: () => void };
  next?: { label: string; onClick: () => void };
  hint?: string;
}

export function SectionPager({ prev, next, hint }: Props): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="border-outline-variant/60 mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6"
    >
      {prev ? (
        <button
          type="button"
          onClick={prev.onClick}
          className="text-on-surface-variant group flex items-center gap-2 text-[12.5px] font-medium transition-colors"
        >
          <span
            aria-hidden
            className="group-hover:bg-primary-container/40 inline-flex size-7 items-center justify-center rounded-full transition-colors"
          >
            ←
          </span>
          <span className="text-left">
            <span className="block text-[10px] uppercase tracking-[0.14em] opacity-70">
              Previous
            </span>
            <span className="group-hover:text-on-surface block text-[13px] font-semibold">
              {prev.label}
            </span>
          </span>
        </button>
      ) : (
        <span />
      )}

      {hint ? (
        <p className="text-on-surface-variant max-w-xs text-center text-[11px] italic">{hint}</p>
      ) : null}

      {next ? (
        <button
          type="button"
          onClick={next.onClick}
          className="text-on-surface group flex items-center gap-2 text-[12.5px] font-medium"
        >
          <span className="text-right">
            <span className="text-on-surface-variant block text-[10px] uppercase tracking-[0.14em] opacity-70">
              Next
            </span>
            <span className="text-primary block text-[13px] font-semibold">{next.label}</span>
          </span>
          <span
            aria-hidden
            className="bg-primary text-on-primary inline-flex size-7 items-center justify-center rounded-full shadow-[0_4px_14px_-4px_rgb(var(--md-sys-color-primary)/0.5)] transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>
      ) : (
        <span />
      )}
    </motion.div>
  );
}
