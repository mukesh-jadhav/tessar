import type { Config } from "tailwindcss";

/**
 * TESSAR — Tailwind theme bound to Material 3 Expressive tokens.
 *
 * Color, radius, and font scales are surfaced as Tailwind utilities backed by
 * CSS custom properties in `lib/theme/tokens.generated.css`. Do not add raw
 * hex values here — change the brand seed in `lib/theme/seed.ts` and re-run
 * `pnpm gen:tokens` instead. See ADR-0001 and ADR-0002.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // M3 tonal roles — values come from tokens.generated.css.
        primary: "rgb(var(--md-sys-color-primary) / <alpha-value>)",
        "on-primary": "rgb(var(--md-sys-color-on-primary) / <alpha-value>)",
        "primary-container": "rgb(var(--md-sys-color-primary-container) / <alpha-value>)",
        "on-primary-container": "rgb(var(--md-sys-color-on-primary-container) / <alpha-value>)",
        secondary: "rgb(var(--md-sys-color-secondary) / <alpha-value>)",
        "on-secondary": "rgb(var(--md-sys-color-on-secondary) / <alpha-value>)",
        "secondary-container": "rgb(var(--md-sys-color-secondary-container) / <alpha-value>)",
        "on-secondary-container": "rgb(var(--md-sys-color-on-secondary-container) / <alpha-value>)",
        tertiary: "rgb(var(--md-sys-color-tertiary) / <alpha-value>)",
        "on-tertiary": "rgb(var(--md-sys-color-on-tertiary) / <alpha-value>)",
        error: "rgb(var(--md-sys-color-error) / <alpha-value>)",
        "on-error": "rgb(var(--md-sys-color-on-error) / <alpha-value>)",
        surface: "rgb(var(--md-sys-color-surface) / <alpha-value>)",
        "on-surface": "rgb(var(--md-sys-color-on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--md-sys-color-on-surface-variant) / <alpha-value>)",
        "surface-container-lowest":
          "rgb(var(--md-sys-color-surface-container-lowest) / <alpha-value>)",
        "surface-container-low": "rgb(var(--md-sys-color-surface-container-low) / <alpha-value>)",
        "surface-container": "rgb(var(--md-sys-color-surface-container) / <alpha-value>)",
        "surface-container-high": "rgb(var(--md-sys-color-surface-container-high) / <alpha-value>)",
        "surface-container-highest":
          "rgb(var(--md-sys-color-surface-container-highest) / <alpha-value>)",
        outline: "rgb(var(--md-sys-color-outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--md-sys-color-outline-variant) / <alpha-value>)",

        // Curated editorial topic surfaces (NOT M3-derived).
        // Use ONLY for bento section cards. Pair only with matching `on-<name>`.
        // See lib/theme/topics.css and design-language.instructions.md.
        ink: "rgb(var(--tessar-ink) / <alpha-value>)",
        "on-ink": "rgb(var(--tessar-on-ink) / <alpha-value>)",
        "on-ink-muted": "rgb(var(--tessar-on-ink-muted) / <alpha-value>)",
        paper: "rgb(var(--tessar-paper) / <alpha-value>)",
        "on-paper": "rgb(var(--tessar-on-paper) / <alpha-value>)",
        "on-paper-muted": "rgb(var(--tessar-on-paper-muted) / <alpha-value>)",
        linen: "rgb(var(--tessar-linen) / <alpha-value>)",
        "on-linen": "rgb(var(--tessar-on-linen) / <alpha-value>)",
        "on-linen-muted": "rgb(var(--tessar-on-linen-muted) / <alpha-value>)",
        sky: "rgb(var(--tessar-sky) / <alpha-value>)",
        "on-sky": "rgb(var(--tessar-on-sky) / <alpha-value>)",
        "on-sky-muted": "rgb(var(--tessar-on-sky-muted) / <alpha-value>)",
      },
      borderRadius: {
        // M3 Expressive shape scale.
        none: "0",
        "xs-shape": "4px",
        "sm-shape": "8px",
        "md-shape": "12px",
        "lg-shape": "16px",
        "xl-shape": "28px",
        full: "9999px",
      },
      fontFamily: {
        // Plus Jakarta Sans (Greenlight's UI font) + JetBrains Mono for code.
        // The Google Sans / Inter / system-ui fallbacks match Greenlight's stack.
        sans: [
          "var(--font-plus-jakarta)",
          "\"Google Sans\"",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      // M3 Expressive type scale. Tuples: [size, { lineHeight, letterSpacing, fontWeight }].
      // Use as: text-display-lg, text-headline-md, text-title-sm, text-body-lg, text-label-md, etc.
      // Reference: https://m3.material.io/styles/typography/type-scale-tokens
      fontSize: {
        "display-lg": ["3.5625rem", { lineHeight: "4rem", letterSpacing: "-0.015625rem", fontWeight: "400" }],
        "display-md": ["2.8125rem", { lineHeight: "3.25rem", letterSpacing: "0", fontWeight: "400" }],
        "display-sm": ["2.25rem", { lineHeight: "2.75rem", letterSpacing: "0", fontWeight: "400" }],
        "headline-lg": ["2rem", { lineHeight: "2.5rem", letterSpacing: "0", fontWeight: "500" }],
        "headline-md": ["1.75rem", { lineHeight: "2.25rem", letterSpacing: "0", fontWeight: "500" }],
        "headline-sm": ["1.5rem", { lineHeight: "2rem", letterSpacing: "0", fontWeight: "500" }],
        "title-lg": ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "0", fontWeight: "500" }],
        "title-md": ["1rem", { lineHeight: "1.5rem", letterSpacing: "0.009375rem", fontWeight: "500" }],
        "title-sm": ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0.00625rem", fontWeight: "500" }],
        "body-lg": ["1rem", { lineHeight: "1.5rem", letterSpacing: "0.03125rem", fontWeight: "400" }],
        "body-md": ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0.015625rem", fontWeight: "400" }],
        "body-sm": ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.025rem", fontWeight: "400" }],
        "label-lg": ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0.00625rem", fontWeight: "500" }],
        "label-md": ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.03125rem", fontWeight: "500" }],
        "label-sm": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.03125rem", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};

export default config;
