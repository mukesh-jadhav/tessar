"use client";

import { motion } from "motion/react";

import type { ArchNode, BuildPhase } from "@/lib/run-package";

/* ---------------------------------------------------------------------------
 * <BuildTimeline /> — horizontal phase strip with what-ships-when.
 *
 * Replaces the bullet-list rendering of buildSequence with a visual
 * timeline so the reader gets a "what do I do first" answer at a glance.
 * Each phase shows its label (e.g. "P0"), title, rationale snippet, and
 * the components it ships.
 * ------------------------------------------------------------------------- */

interface Props {
  phases: BuildPhase[];
  nodes: ArchNode[];
}

export function BuildTimeline({ phases, nodes }: Props): React.ReactElement {
  const labelById = new Map(nodes.map((n) => [n.id, n.label]));
  if (!phases.length) {
    return (
      <p className="text-on-surface-variant text-[12px] italic">
        No build sequence emitted for this run.
      </p>
    );
  }
  return (
    <div className="relative">
      {/* Spine */}
      <div
        aria-hidden
        className="bg-outline-variant/50 absolute left-0 right-0 top-[14px] hidden h-[2px] rounded-full md:block"
      />
      <ol className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {phases.map((ph, i) => (
          <motion.li
            key={ph.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.35, delay: i * 0.06, ease: [0.4, 0, 0.2, 1] }}
            className="relative"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="bg-primary text-on-primary relative z-10 grid size-7 place-items-center rounded-full text-[11px] font-bold shadow-[0_4px_14px_-4px_rgb(var(--md-sys-color-primary)/0.5)]"
              >
                {i + 1}
              </span>
              <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
                {ph.label}
              </span>
            </div>
            <div className="border-outline-variant/60 bg-surface-container-low mt-3 rounded-xl border p-3.5">
              <p className="text-on-surface text-[13.5px] font-semibold leading-snug">{ph.title}</p>
              <p className="text-on-surface-variant mt-1.5 text-[12px] leading-relaxed">
                {ph.rationale}
              </p>
              {ph.nodes.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ph.nodes.map((id) => (
                    <span
                      key={id}
                      className="border-outline-variant/60 bg-surface text-on-surface-variant rounded-full border px-2 py-0.5 text-[10.5px]"
                    >
                      {labelById.get(id) ?? id}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
