"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

import { fmtUsd } from "@/components/package/package-view";
import type { BomLine } from "@/lib/run-package";

/* ---------------------------------------------------------------------------
 * <CostTrajectoryChart /> — SVG area chart of monthly cost at growing scale.
 *
 * Plots 1× → 10× → 100× projected monthly spend on a log-x axis. Animated
 * in on mount. Hover-free; the chart is supplemented by the three
 * cost-tier cards next to it so we don't fight that affordance.
 * ------------------------------------------------------------------------- */

interface Props {
  bom: BomLine[];
}

const SCALES = [1, 10, 100] as const;
const VB_W = 320;
const VB_H = 120;
const PAD = { left: 36, right: 12, top: 12, bottom: 22 };

export function CostTrajectoryChart({ bom }: Props): React.ReactElement {
  const points = useMemo(() => {
    return SCALES.map((s) => ({ scale: s, value: sumAtScale(bom, s, s, s) }));
  }, [bom]);

  const max = Math.max(...points.map((p) => p.value), 1);
  const min = 0;

  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;

  // log-x mapping so 1×, 10×, 100× are evenly spaced visually.
  const xOf = (scale: number): number => {
    const logMax = Math.log10(SCALES[SCALES.length - 1]!);
    const t = logMax === 0 ? 0 : Math.log10(scale) / logMax;
    return PAD.left + t * plotW;
  };
  const yOf = (v: number): number => {
    const t = max === min ? 0 : (v - min) / (max - min);
    return PAD.top + plotH - t * plotH;
  };

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.scale)},${yOf(p.value)}`)
    .join(" ");
  const areaPath = `${linePath} L${xOf(points[points.length - 1]!.scale)},${PAD.top + plotH} L${xOf(points[0]!.scale)},${PAD.top + plotH} Z`;

  // y-axis grid at 0%, 50%, 100% of max
  const grid = [0, 0.5, 1].map((t) => ({
    y: PAD.top + plotH - t * plotH,
    label: fmtUsd(min + (max - min) * t),
  }));

  return (
    <div className="bg-surface-container-low border-outline-variant/60 overflow-hidden rounded-2xl border p-4">
      <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
        Monthly cost · 1× → 100×
      </p>
      <svg
        role="img"
        aria-label="Monthly cost trajectory at increasing scale"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="mt-2 block h-[140px] w-full"
      >
        <defs>
          <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--md-sys-color-primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--md-sys-color-primary))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* y-grid */}
        {grid.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={g.y}
              y2={g.y}
              stroke="rgb(var(--md-sys-color-outline-variant))"
              strokeWidth={0.5}
              strokeDasharray="2 3"
            />
            <text
              x={PAD.left - 4}
              y={g.y + 3}
              textAnchor="end"
              fontSize={8}
              fill="rgb(var(--md-sys-color-on-surface-variant))"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* area + line */}
        <motion.path
          d={areaPath}
          fill="url(#costFill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        />
        <motion.path
          d={linePath}
          fill="none"
          stroke="rgb(var(--md-sys-color-primary))"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        />

        {/* points */}
        {points.map((p, i) => (
          <g key={p.scale}>
            <motion.circle
              cx={xOf(p.scale)}
              cy={yOf(p.value)}
              r={3}
              fill="rgb(var(--md-sys-color-primary))"
              stroke="rgb(var(--md-sys-color-surface))"
              strokeWidth={1.2}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4 + i * 0.12, type: "spring", stiffness: 220, damping: 16 }}
            />
            <text
              x={xOf(p.scale)}
              y={yOf(p.value) - 8}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={600}
              fill="rgb(var(--md-sys-color-on-surface))"
            >
              {fmtUsd(p.value)}
            </text>
            <text
              x={xOf(p.scale)}
              y={VB_H - 6}
              textAnchor="middle"
              fontSize={8.5}
              fill="rgb(var(--md-sys-color-on-surface-variant))"
            >
              {p.scale}×
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function sumAtScale(bom: BomLine[], u: number, r: number, g: number): number {
  return bom.reduce((sum, l) => {
    if (l.fixed) return sum + (l.baseCost || 0);
    const exp = l.scaleExp ?? {};
    const factor =
      Math.pow(u, exp.users ?? 0) * Math.pow(r, exp.rps ?? 0) * Math.pow(g, exp.gb ?? 0);
    return sum + (l.baseCost || 0) * factor;
  }, 0);
}
