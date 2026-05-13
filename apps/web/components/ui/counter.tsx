/**
 * Counter — tiny editorial label/value pair. Used in run-progress bottom
 * bar and anywhere else we want a single "label · value" stat inline.
 *
 *   tokens 12,400   cost $0.42   sources 17
 *
 * The label is uppercase tracked-out micro-text; the value is bold tabular.
 */

import type { ReactNode } from "react";

export interface CounterProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function Counter({ label, value, className = "" }: CounterProps): React.ReactElement {
  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <span className="font-semibold tabular-nums text-on-surface">{value}</span>
    </span>
  );
}
