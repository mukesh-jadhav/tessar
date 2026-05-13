/**
 * ConfidencePill — three-step confidence chip used in decision panels.
 *
 *   • high  primary dot, primary text
 *   • med   muted-primary dot
 *   • low   neutral dim dot
 *
 * The dot is the only colored element; text uses on-surface-variant so the
 * pill stays readable at small sizes without competing with the value.
 */

export type Confidence = "low" | "med" | "high";

export interface ConfidencePillProps {
  conf: Confidence;
  className?: string;
}

export function ConfidencePill({ conf, className = "" }: ConfidencePillProps): React.ReactElement {
  const dot =
    conf === "high"
      ? "bg-primary"
      : conf === "med"
        ? "bg-primary/60"
        : "bg-on-surface/40";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-on-surface-variant ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {conf}
    </span>
  );
}
