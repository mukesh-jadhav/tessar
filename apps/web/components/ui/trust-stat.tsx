/**
 * TrustStat — one entry in an editorial trust-bar (sign-in, marketing).
 *
 * Compact, hairline-bordered card with a tabular-nums value and a tiny
 * tracked-out subtitle. Designed to sit in a 3-up grid.
 */

import type { ReactNode } from "react";

export interface TrustStatProps {
  value: ReactNode;
  sub: string;
  className?: string;
}

export function TrustStat({ value, sub, className = "" }: TrustStatProps): React.ReactElement {
  return (
    <li
      className={`rounded-xl border border-outline-variant bg-surface/80 px-2 py-2 text-center backdrop-blur ${className}`}
    >
      <p className="text-[14px] font-semibold tabular-nums text-on-surface">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{sub}</p>
    </li>
  );
}
