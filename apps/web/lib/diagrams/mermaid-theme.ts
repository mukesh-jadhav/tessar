/**
 * Mermaid theme bound to Material 3 tokens.
 *
 * Diagrams are first-class UI in TESSAR — they must read as part of the
 * product, not as a generic library output. Fill values reference our
 * generated CSS custom properties so light/dark switching is automatic.
 *
 * Usage (Phase 1+):
 *   import mermaid from "mermaid";
 *   import { mermaidTheme } from "@/lib/diagrams/mermaid-theme";
 *   mermaid.initialize({ startOnLoad: false, ...mermaidTheme });
 */

export const mermaidTheme = {
  theme: "base" as const,
  themeVariables: {
    fontFamily: "var(--font-roboto-flex), system-ui, sans-serif",
    primaryColor: "rgb(var(--md-sys-color-primary-container))",
    primaryTextColor: "rgb(var(--md-sys-color-on-primary-container))",
    primaryBorderColor: "rgb(var(--md-sys-color-outline))",
    lineColor: "rgb(var(--md-sys-color-outline))",
    secondaryColor: "rgb(var(--md-sys-color-secondary-container))",
    tertiaryColor: "rgb(var(--md-sys-color-tertiary-container))",
    background: "rgb(var(--md-sys-color-surface))",
    mainBkg: "rgb(var(--md-sys-color-surface-container-low))",
    nodeBorder: "rgb(var(--md-sys-color-outline-variant))",
    clusterBkg: "rgb(var(--md-sys-color-surface-container))",
    clusterBorder: "rgb(var(--md-sys-color-outline-variant))",
    titleColor: "rgb(var(--md-sys-color-on-surface))",
    edgeLabelBackground: "rgb(var(--md-sys-color-surface-container-high))",
    textColor: "rgb(var(--md-sys-color-on-surface))",
  },
} as const;
