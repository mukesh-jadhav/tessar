# ADR-0001: Design Language — Material 3 Expressive on Web (Tailwind + shadcn + selective MWC)

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** founder

## Context

TESSAR sells researched, defensible architecture packages. The product must feel premium, trustworthy, and modern. Users will look at the live progress view, the result tabs, and the diagrams more than any other surface.

Google's Material 3 Expressive (https://developer.android.com/design/) is the most distinctive design language Google has shipped in years: bigger shapes, springier motion, expressive typography, content-driven color. It matches the tone we want.

The wrinkle: M3 Expressive's *Android* implementation (Compose) is mature; the *web* implementation is less mature. `@material/web` (MWC) covers basics but not all Expressive patterns. MUI is on M3 but not yet fully Expressive.

## Decision

Adopt **Material 3 Expressive** as TESSAR's web design language using a hybrid implementation:

- **Skeleton:** Next.js 15 + Tailwind CSS + shadcn/ui (unstyled, accessible primitives — give us behavior; we re-skin to M3).
- **Tokens:** Generate M3 design tokens (color, type, shape, motion, elevation) from a single brand seed via `@material/material-color-utilities` → CSS custom properties + Tailwind theme extension.
- **Selective MWC:** Use `@material/web` (wrapped as React) for components where Expressive's motion is hard to recreate — wavy linear progress, FAB, ripple.
- **Icons:** Material Symbols (variable font).
- **Fonts:** Roboto Flex for UI, Google Sans Code for code/diagrams.
- **Motion:** Motion (formerly Framer Motion) with M3 Expressive spring presets defined once.
- **Diagrams:** Mermaid themed with our M3 color tokens.

This gives us the M3 Expressive *feel* without being blocked by web-tooling gaps. It is the same pattern Google uses on web properties that aren't pure MWC.

## Alternatives Considered

- **Pure `@material/web` (MWC) only** — rejected: gaps in component coverage, would force us to build many missing pieces from scratch.
- **MUI on M3** — rejected: not yet fully Expressive; styling escape hatches encourage drift; large bundle.
- **Headless UI / Radix + custom design system** — rejected: discards a coherent, well-researched language; opens the door to drift.
- **Chakra / Mantine / Ant Design** — rejected: visually distinct from M3 Expressive, would not deliver the intended feel.
- **Pure Tailwind + custom components only** — rejected: too easy to drift; loses the M3 token system that gives us free dark mode and a11y-correct contrast.

## Consequences

**Easier:**
- Free dark mode and WCAG AA contrast via M3 tonal palettes.
- Single brand seed change re-themes the whole product.
- Mermaid diagrams visually consistent with the rest of the UI.
- Premium, modern feel without inventing a design language.

**Harder:**
- Two component sources (shadcn + selective MWC) requires discipline; codified in `.github/instructions/design-language.instructions.md`.
- Spring-based motion takes more deliberate authoring than ease curves.
- Some Expressive patterns (e.g., morphing shapes) may require custom motion code.

**Follow-up:**
- ADR-0002 locks the brand seed color.
- Phase 0 builds the token pipeline and 8 themed reference components in Storybook.

## References

- https://m3.material.io/
- https://developer.android.com/design/
- https://github.com/material-components/material-web
- https://github.com/material-foundation/material-color-utilities
