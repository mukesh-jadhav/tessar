# ADR-0002: Brand Seed Color

- **Status:** Amended by ADR-0003 (2026-05-11) — seed changed from `#0B57D0` to `#2547B8`
- **Date:** 2026-05-11
- **Deciders:** founder

## Context

Material 3 dynamic color generates a full tonal palette (and therefore the entire UI's color language, in both light and dark schemes) from a single seed color. The seed must be picked before Phase 0 token generation can run.

Brand brief: "very neutral, beautiful, professional, calm — Google-style."

## Decision

Brand seed color: **`#0B57D0`**

This is Google's Material 3 reference primary blue. It is recognizably Google-family without being the more on-the-nose `#4285F4` Google brand blue. M3 dynamic color produces clean, restrained tonal palettes from it that read as professional and calm in both light and dark schemes.

The seed lives in a single source file (`apps/web/lib/theme/seed.ts`) and the rest of the design tokens are generated from it. To change the brand color later, change this one constant and re-run `pnpm gen:tokens`.

## Alternatives Considered

- **`#4285F4` Google brand blue** — too on-the-nose; reads as "Google product," not as TESSAR.
- **`#3D5A80` desaturated navy** — calmer, more distinctive, but tonal palettes come out muted; risks looking heavy.
- **`#5B7FA6` muted slate blue** — too desaturated; M3 derives weak palettes from low-chroma seeds.
- **Deep purple `#5B5BD6`** — premium and distinctive, but conflicts with the "calm + Google-style" brief.
- **Teal/emerald** — calm but less professional in this category.

## Consequences

**Easier:**
- Familiar, trust-signaling color family for an architecture/decision tool.
- M3 produces strong, accessible tonal palettes from this seed.

**Harder:**
- Visually closer to many other dev-tools in the blue family; differentiation must come from typography, motion, and content density rather than hue alone.

**Follow-up:**
- Phase 0 generates `tokens.generated.css` from this seed.
- Re-evaluate after Phase 1 user feedback if the brand reads as too generic.

## References

- ADR-0001 (Design Language)
- https://m3.material.io/styles/color/dynamic-color/overview
