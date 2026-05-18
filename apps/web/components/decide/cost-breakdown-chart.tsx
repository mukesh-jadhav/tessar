"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

import { fmtUsd } from "@/components/package/package-view";
import type { BomLine } from "@/lib/run-package";

/* ---------------------------------------------------------------------------
 * <CostBreakdownChart /> — horizontal bar chart of priced BOM lines.
 *
 * Replaces the "% of total" column with something the eye can compare at
 * a glance. Shows top N lines plus an "Other" rollup so the chart stays
 * legible regardless of BOM size. Colour-coded by kind so compute /
 * data / storage / network / vendor are visually separable.
 * ------------------------------------------------------------------------- */

const KIND_COLOR: Record<BomLine["kind"], string> = {
  compute: "rgb(var(--md-sys-color-primary))",
  data: "rgb(var(--md-sys-color-secondary))",
  storage: "rgb(var(--md-sys-color-tertiary))",
  network: "rgb(var(--md-sys-color-primary) / 0.55)",
  vendor: "rgb(var(--md-sys-color-on-surface-variant))",
};

const KIND_LABEL: Record<BomLine["kind"], string> = {
  compute: "Compute",
  data: "Data",
  storage: "Storage",
  network: "Network",
  vendor: "Vendor",
};

interface Props {
  bom: BomLine[];
  topN?: number;
}

export function CostBreakdownChart({ bom, topN = 6 }: Props): React.ReactElement {
  const { rows, total, kinds } = useMemo(() => {
    const sorted = [...bom].sort((a, b) => (b.baseCost || 0) - (a.baseCost || 0));
    const sum = sorted.reduce((s, l) => s + (l.baseCost || 0), 0);

    const head = sorted.slice(0, topN);
    const tail = sorted.slice(topN);
    const tailCost = tail.reduce((s, l) => s + (l.baseCost || 0), 0);

    type Row = { id: string; name: string; kind: BomLine["kind"]; cost: number; pct: number };
    const headRows: Row[] = head.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      cost: l.baseCost || 0,
      pct: sum > 0 ? ((l.baseCost || 0) / sum) * 100 : 0,
    }));
    const otherRow: Row[] = tail.length
      ? [
          {
            id: "__other",
            name: `Other (${tail.length} line${tail.length === 1 ? "" : "s"})`,
            kind: "vendor",
            cost: tailCost,
            pct: sum > 0 ? (tailCost / sum) * 100 : 0,
          },
        ]
      : [];

    // Kind totals for the legend / mini stacked bar.
    const kindTotals = new Map<BomLine["kind"], number>();
    for (const l of sorted) {
      kindTotals.set(l.kind, (kindTotals.get(l.kind) ?? 0) + (l.baseCost || 0));
    }
    return {
      rows: [...headRows, ...otherRow],
      total: sum,
      kinds: Array.from(kindTotals.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]),
    };
  }, [bom, topN]);

  if (!rows.length || total <= 0) {
    return (
      <p className="text-on-surface-variant text-[12px] italic">No priced services to chart yet.</p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stacked summary strip — share by component kind. */}
      <div>
        <div className="bg-surface-container relative flex h-3 w-full overflow-hidden rounded-full">
          {kinds.map(([kind, value]) => {
            const pct = (value / total) * 100;
            return (
              <motion.span
                key={kind}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                style={{ background: KIND_COLOR[kind] }}
                title={`${KIND_LABEL[kind]} · ${fmtUsd(value)} · ${pct.toFixed(0)}%`}
                className="block h-full"
              />
            );
          })}
        </div>
        <ul className="text-on-surface-variant mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {kinds.map(([kind, value]) => (
            <li key={kind} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: KIND_COLOR[kind] }}
              />
              {KIND_LABEL[kind]}{" "}
              <span className="tabular-nums opacity-70">{((value / total) * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Per-line horizontal bars. */}
      <ol className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.id}>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="text-on-surface min-w-0 truncate font-medium">{r.name}</span>
              <span className="text-on-surface-variant shrink-0 tabular-nums">
                {fmtUsd(r.cost)} <span className="opacity-70">· {r.pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="bg-surface-container mt-1 h-1.5 w-full overflow-hidden rounded-full">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(r.pct, 1.5)}%` }}
                transition={{
                  duration: 0.55,
                  delay: 0.05 + i * 0.04,
                  ease: [0.4, 0, 0.2, 1],
                }}
                style={{ background: KIND_COLOR[r.kind] }}
                className="block h-full"
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
