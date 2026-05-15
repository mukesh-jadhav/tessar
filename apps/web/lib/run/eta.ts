/**
 * Run ETA — estimate remaining time on the run-watch screen.
 *
 * Honest by construction: the estimate is derived from the user's
 * actual elapsed time vs phases completed so far. We never invent
 * progress that hasn't happened. Before the first phase completes
 * we fall back to the product target (8–15 minutes; midpoint 12).
 *
 * Used by /run/[id] to give users a "about N minutes left" chip
 * so the wait feels bounded.
 */

/** Midpoint of the locked product target (MVP: 8–15 min runs). */
const TARGET_TOTAL_MS = 12 * 60_000;

/** Don't show "less than a minute" until we genuinely think we're close. */
const MIN_REMAINING_MS = 30_000;

/**
 * Estimate remaining wall-clock time, in milliseconds.
 *
 * Returns `null` only when we lack any signal (run hasn't started).
 * Returns `0` when the run is finished.
 */
export function estimateRemainingMs(
  elapsedMs: number,
  completedPhases: number,
  totalPhases: number,
): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  if (totalPhases <= 0) return null;
  if (completedPhases >= totalPhases) return 0;

  if (completedPhases === 0) {
    // No phase has finished yet — anchor on the product target.
    return Math.max(TARGET_TOTAL_MS - elapsedMs, MIN_REMAINING_MS);
  }

  const perPhase = elapsedMs / completedPhases;
  const remaining = perPhase * (totalPhases - completedPhases);
  return Math.max(remaining, MIN_REMAINING_MS);
}

/**
 * Human-friendly ETA. Conservative ceil so we never under-promise.
 * Caps at "10–15 minutes" early on so we don't show wild numbers
 * when only one phase has completed.
 */
export function formatEta(ms: number | null): string {
  if (ms === null) return "estimating…";
  if (ms <= 0) return "wrapping up";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return "less than a minute left";
  if (minutes >= 15) return "10–15 minutes left";
  return `about ${minutes} minutes left`;
}
