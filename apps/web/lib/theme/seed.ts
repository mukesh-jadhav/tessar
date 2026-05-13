/**
 * TESSAR brand seed color.
 *
 * Single source of truth for Material 3 dynamic color generation.
 * Changing this and re-running `pnpm gen:tokens` re-themes the entire product.
 *
 * See ADR-0002 (and ADR-0003 for the editorial design pivot).
 *
 * 2026-05-11: Re-seeded to Greenlight's signal green (`#137333`) per founder
 * direction "set color system as greenlight.report". Produces a Google-style
 * green-tinted neutral palette via the Material 3 generator that matches
 * Greenlight's surface/text/border tones (`#F8F9FA` / `#1F1F1F` / `#E8EAED`).
 */
export const BRAND_SEED = "#137333" as const;

/**
 * Convert a hex string like "#0B57D0" to the integer ARGB form used by
 * Material Color Utilities (alpha defaults to 0xFF).
 */
export function seedToArgb(hex: string = BRAND_SEED): number {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) {
    throw new Error(`Invalid seed hex: ${hex}`);
  }
  return Number.parseInt("ff" + clean, 16);
}
