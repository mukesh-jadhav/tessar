"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils/cn";

/**
 * M3 Expressive wavy linear progress indicator.
 *
 * Renders a sine-wave SVG path that scrolls horizontally. When `value` is set
 * (0–100), the indicator becomes determinate; when omitted, it animates
 * indefinitely. Respects `prefers-reduced-motion` via the global rule.
 *
 * NOTE: This is a hand-rolled SVG variant rather than `<md-linear-progress>`
 * so it stays bound to our M3 tokens and works in SSR. Swap to MWC's wavy
 * progress later if Expressive parity gaps need closing.
 */
export function WavyProgress({
  value,
  className,
  ariaLabel = "Loading",
}: {
  value?: number;
  className?: string;
  ariaLabel?: string;
}): React.ReactElement {
  const determinate = typeof value === "number";
  const pct = determinate ? Math.max(0, Math.min(100, value)) : 35;

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? pct : undefined}
      className={cn("relative h-3 w-full overflow-hidden rounded-full bg-surface-container-high", className)}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        className="absolute inset-y-0 left-0 overflow-hidden"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 200 12"
          preserveAspectRatio="none"
          className="h-full w-[200%] text-primary"
        >
          <motion.path
            d="M 0 6 Q 12.5 0 25 6 T 50 6 T 75 6 T 100 6 T 125 6 T 150 6 T 175 6 T 200 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            animate={determinate ? undefined : { x: [-100, 0] }}
            transition={
              determinate
                ? undefined
                : { duration: 1.4, repeat: Infinity, ease: "linear" }
            }
          />
        </svg>
      </motion.div>
    </div>
  );
}
