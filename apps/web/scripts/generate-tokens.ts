/**
 * Generate Material 3 design tokens from the brand seed.
 *
 * Reads `lib/theme/seed.ts`, derives light + dark schemes via
 * Material Color Utilities, and writes:
 *   - lib/theme/tokens.generated.css    (CSS custom properties)
 *   - lib/theme/tokens.generated.ts     (typed token map)
 *
 * Run with: `pnpm gen:tokens`
 *
 * See ADR-0001, ADR-0002.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  type Scheme,
} from "@material/material-color-utilities";

import { BRAND_SEED } from "../lib/theme/seed";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../lib/theme");

/** Tonal roles we surface as CSS custom properties (kebab-case names). */
const ROLES = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "background",
  "onBackground",
  "surface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "outline",
  "outlineVariant",
  "shadow",
  "scrim",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary",
] as const;

type Role = (typeof ROLES)[number];

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function rgbTriple(argb: number): string {
  const hex = hexFromArgb(argb).replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function schemeBlock(scheme: Scheme, mode: "light" | "dark"): string {
  const lines: string[] = [];
  for (const role of ROLES) {
    const argb = (scheme as unknown as Record<Role, number>)[role];
    if (typeof argb === "number") {
      lines.push(`  --md-sys-color-${camelToKebab(role)}: ${rgbTriple(argb)};`);
    }
  }
  // Surface container scale — Material 3 Expressive layered hierarchy.
  // These are derived heuristically from neutral palette tones; refine with
  // a full palette generator post-Phase 0.
  const palette = mode === "light"
    ? { lowest: 100, low: 96, base: 94, high: 92, highest: 90 }
    : { lowest: 4, low: 10, base: 12, high: 17, highest: 22 };
  const neutralFor = (tone: number) => {
    const argb = themeFromSourceColor(argbFromHex(BRAND_SEED)).palettes.neutral.tone(tone);
    return rgbTriple(argb);
  };
  lines.push(`  --md-sys-color-surface-container-lowest: ${neutralFor(palette.lowest)};`);
  lines.push(`  --md-sys-color-surface-container-low: ${neutralFor(palette.low)};`);
  lines.push(`  --md-sys-color-surface-container: ${neutralFor(palette.base)};`);
  lines.push(`  --md-sys-color-surface-container-high: ${neutralFor(palette.high)};`);
  lines.push(`  --md-sys-color-surface-container-highest: ${neutralFor(palette.highest)};`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const theme = themeFromSourceColor(argbFromHex(BRAND_SEED));
  const lightCss = schemeBlock(theme.schemes.light, "light");
  const darkCss = schemeBlock(theme.schemes.dark, "dark");

  const css = `/**
 * GENERATED — do not edit by hand.
 * Run \`pnpm gen:tokens\` after changing the brand seed.
 * Source: lib/theme/seed.ts (BRAND_SEED = ${BRAND_SEED})
 */

:root,
:root[data-theme="light"] {
${lightCss}
}

:root[data-theme="dark"] {
${darkCss}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
${darkCss
  .split("\n")
  .map((l) => `  ${l}`)
  .join("\n")}
  }
}
`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, "tokens.generated.css"), css, "utf8");

  const ts = `// GENERATED — do not edit by hand.\n// Source: lib/theme/seed.ts (BRAND_SEED = ${BRAND_SEED})\nexport const BRAND_SEED_USED = "${BRAND_SEED}" as const;\n`;
  await writeFile(resolve(OUT_DIR, "tokens.generated.ts"), ts, "utf8");

  console.log(`Wrote tokens for seed ${BRAND_SEED} to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
