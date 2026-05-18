"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

import type { Risk, Severity } from "@/lib/run-package";

/* ---------------------------------------------------------------------------
 * <RiskHeatmap /> — 3×3 severity × likelihood matrix.
 *
 * Each cell shows count of risks in that bucket; clicking nothing for now
 * (Phase 1 is read-only). Background opacity tracks count so the eye
 * lands on the hot corner immediately.
 * ------------------------------------------------------------------------- */

const LEVELS: Severity[] = ["high", "med", "low"];
const LEVEL_LABEL: Record<Severity, string> = { high: "High", med: "Med", low: "Low" };

interface Props {
  risks: Risk[];
}

export function RiskHeatmap({ risks }: Props): React.ReactElement {
  const grid = useMemo(() => {
    // rows = severity (high at top), cols = likelihood (high at right).
    const m: Record<Severity, Record<Severity, Risk[]>> = {
      high: { high: [], med: [], low: [] },
      med: { high: [], med: [], low: [] },
      low: { high: [], med: [], low: [] },
    };
    for (const r of risks) {
      const sev = (LEVELS.includes(r.severity) ? r.severity : "low") as Severity;
      const lik = (LEVELS.includes(r.likelihood) ? r.likelihood : "low") as Severity;
      m[sev][lik].push(r);
    }
    return m;
  }, [risks]);

  const max = useMemo(() => {
    let n = 0;
    for (const s of LEVELS) for (const l of LEVELS) n = Math.max(n, grid[s][l].length);
    return Math.max(n, 1);
  }, [grid]);

  return (
    <div className="bg-surface-container-low border-outline-variant/60 rounded-2xl border p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
          Severity × likelihood
        </p>
        <p className="text-on-surface-variant text-[10.5px]">
          {risks.length} risk{risks.length === 1 ? "" : "s"} plotted
        </p>
      </div>

      <div className="mt-4 grid grid-cols-[auto_repeat(3,1fr)] gap-1.5">
        {/* header row */}
        <div />
        {LEVELS.slice()
          .reverse()
          .map((lik) => (
            <p
              key={`h-${lik}`}
              className="text-on-surface-variant text-center text-[10px] font-semibold uppercase tracking-wide"
            >
              {LEVEL_LABEL[lik]}
            </p>
          ))}

        {/* rows */}
        {LEVELS.map((sev, rowIdx) => (
          <RowFragment key={sev} sev={sev} rowIdx={rowIdx} grid={grid} max={max} />
        ))}

        {/* x-axis label */}
        <div />
        <p className="text-on-surface-variant col-span-3 mt-1 text-center text-[10px] uppercase tracking-wide">
          ← likelihood →
        </p>
      </div>

      <p className="text-on-surface-variant mt-3 text-[11px] leading-relaxed">
        Top-right is the hot corner — high-severity, high-likelihood risks belong on the next
        sprint, not the backlog.
      </p>
    </div>
  );
}

function RowFragment({
  sev,
  rowIdx,
  grid,
  max,
}: {
  sev: Severity;
  rowIdx: number;
  grid: Record<Severity, Record<Severity, Risk[]>>;
  max: number;
}): React.ReactElement {
  return (
    <>
      <p className="text-on-surface-variant flex items-center justify-end pr-1 text-right text-[10px] font-semibold uppercase tracking-wide">
        {LEVEL_LABEL[sev]}
      </p>
      {LEVELS.slice()
        .reverse()
        .map((lik, colIdx) => {
          const cell = grid[sev][lik];
          const intensity = cell.length / max;
          const hot = sev === "high" && (lik === "high" || lik === "med");
          return (
            <motion.div
              key={`${sev}-${lik}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.3,
                delay: 0.05 * (rowIdx * 3 + colIdx),
                ease: [0.4, 0, 0.2, 1],
              }}
              className={[
                "relative grid min-h-[68px] place-items-center rounded-xl border p-2 text-center",
                hot
                  ? "border-error/40"
                  : sev === "low" || lik === "low"
                    ? "border-outline-variant/50"
                    : "border-outline-variant/70",
              ].join(" ")}
              style={{
                background: cell.length
                  ? hot
                    ? `rgb(var(--md-sys-color-error-container) / ${0.35 + intensity * 0.55})`
                    : `rgb(var(--md-sys-color-primary-container) / ${0.22 + intensity * 0.5})`
                  : "rgb(var(--md-sys-color-surface-container) / 0.4)",
              }}
            >
              <div>
                <p
                  className={[
                    "text-[18px] font-semibold tabular-nums",
                    cell.length === 0
                      ? "text-on-surface-variant/50"
                      : hot
                        ? "text-on-error-container"
                        : "text-on-surface",
                  ].join(" ")}
                >
                  {cell.length}
                </p>
                {cell.length ? (
                  <p
                    className={[
                      "mt-0.5 line-clamp-1 text-[10px]",
                      hot ? "text-on-error-container/85" : "text-on-surface-variant",
                    ].join(" ")}
                  >
                    {cell[0]!.title}
                  </p>
                ) : (
                  <p className="text-on-surface-variant/40 text-[10px]">—</p>
                )}
              </div>
            </motion.div>
          );
        })}
    </>
  );
}
