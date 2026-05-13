/**
 * Editorial motion presets.
 *
 * Use these instead of inline magic numbers or ease curves. Add new presets
 * here (with a PR-justified reason) rather than tuning at call sites.
 *
 * See ADR-0003 — motion is restrained; no playful overshoot in shipped UI.
 */

export const springs = {
  /** Default editorial spring for most state transitions. */
  expressiveDefault: { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const,
  /** Slightly snappier, for chip / button activations. */
  expressiveFast: { type: "spring", stiffness: 420, damping: 32, mass: 1 } as const,
  /** Standard non-spring — quiet emphasized fade for page transitions. */
  standardEmphasized: { duration: 0.4, ease: [0.2, 0, 0, 1] as const },
} as const;

export type SpringPreset = keyof typeof springs;
