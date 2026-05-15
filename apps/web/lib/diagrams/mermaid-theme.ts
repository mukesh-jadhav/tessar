/**
 * Mermaid theme bound to Material 3 tokens.
 *
 * Diagrams are first-class UI in TESSAR — they must read as part of the
 * product, not as a generic library output. Fill values reference our
 * generated CSS custom properties so light/dark switching is automatic.
 *
 * Mermaid's color parser does not understand `rgb(var(--token))` — it
 * needs literal CSS color strings. Call `resolveMermaidTheme()` on the
 * client at render time to materialise the current tokens.
 *
 * Usage (Phase 1+):
 *   import mermaid from "mermaid";
 *   import { resolveMermaidTheme } from "@/lib/diagrams/mermaid-theme";
 *   mermaid.initialize({ startOnLoad: false, ...resolveMermaidTheme() });
 */

const TOKEN_MAP = {
  primaryColor: "--md-sys-color-primary-container",
  primaryTextColor: "--md-sys-color-on-primary-container",
  primaryBorderColor: "--md-sys-color-outline",
  lineColor: "--md-sys-color-outline",
  secondaryColor: "--md-sys-color-secondary-container",
  tertiaryColor: "--md-sys-color-tertiary-container",
  background: "--md-sys-color-surface",
  mainBkg: "--md-sys-color-surface-container-low",
  nodeBorder: "--md-sys-color-outline-variant",
  clusterBkg: "--md-sys-color-surface-container",
  clusterBorder: "--md-sys-color-outline-variant",
  titleColor: "--md-sys-color-on-surface",
  edgeLabelBackground: "--md-sys-color-surface-container-high",
  textColor: "--md-sys-color-on-surface",
} as const;

// Light-theme defaults used during SSR or before hydration. These match
// the values in tokens.generated.css :root block — keep in sync if the
// brand seed changes.
const FALLBACK_RGB: Record<string, string> = {
  "--md-sys-color-primary-container": "156 247 167",
  "--md-sys-color-on-primary-container": "0 33 5",
  "--md-sys-color-outline": "115 121 113",
  "--md-sys-color-secondary-container": "215 232 213",
  "--md-sys-color-tertiary-container": "188 235 250",
  "--md-sys-color-surface": "247 251 244",
  "--md-sys-color-surface-container-low": "242 246 239",
  "--md-sys-color-surface-container": "236 240 233",
  "--md-sys-color-surface-container-high": "230 234 227",
  "--md-sys-color-outline-variant": "194 200 191",
  "--md-sys-color-on-surface": "24 29 24",
};

const FONT_FAMILY = "var(--font-roboto-flex), system-ui, sans-serif";

function readToken(name: string): string {
  if (typeof window === "undefined") {
    return FALLBACK_RGB[name] ?? "0 0 0";
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || FALLBACK_RGB[name] || "0 0 0";
}

/** Resolve token references to literal `rgb(R G B)` strings Mermaid can parse. */
export function resolveMermaidTheme() {
  const themeVariables: Record<string, string> = { fontFamily: FONT_FAMILY };
  for (const [key, token] of Object.entries(TOKEN_MAP)) {
    themeVariables[key] = `rgb(${readToken(token)})`;
  }
  return {
    theme: "base" as const,
    themeVariables,
  };
}

/** @deprecated Use `resolveMermaidTheme()` — token references can't be parsed by Mermaid. */
export const mermaidTheme = {
  theme: "base" as const,
  themeVariables: {
    fontFamily: FONT_FAMILY,
  },
} as const;
