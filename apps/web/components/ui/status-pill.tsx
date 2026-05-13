/**
 * StatusPill — outcome chip for a run row (dashboard) or a node panel.
 *
 *   • Completed   primary   solid dot
 *   • In progress neutral   pulsing dot
 *   • Failed      error     solid dot
 *   • Refunded    muted     dim dot
 */

export type StatusKind = "completed" | "in_progress" | "failed" | "refunded";

export interface StatusPillProps {
  status: StatusKind;
  className?: string;
}

const MAP: Record<StatusKind, { label: string; cls: string; dot: string }> = {
  completed: {
    label: "Completed",
    cls: "border-primary/40 bg-primary/[0.06] text-primary",
    dot: "bg-primary",
  },
  in_progress: {
    label: "In progress",
    cls: "border-outline-variant bg-surface text-on-surface",
    dot: "bg-primary animate-pulse",
  },
  failed: {
    label: "Failed",
    cls: "border-error/40 bg-error/[0.06] text-error",
    dot: "bg-error",
  },
  refunded: {
    label: "Refunded",
    cls: "border-outline-variant bg-on-surface/[0.04] text-on-surface-variant",
    dot: "bg-on-surface/30",
  },
};

export function StatusPill({ status, className = "" }: StatusPillProps): React.ReactElement {
  const m = MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${m.cls} ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
