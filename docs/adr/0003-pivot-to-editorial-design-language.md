# ADR-0003: Pivot from Material 3 Expressive to Editorial Restraint (with Bento)

- **Status:** Accepted (amended 2026-05-11 with the editorial-bento evolution after reviewing https://developer.android.com/develop)
- **Date:** 2026-05-11
- **Deciders:** founder
- **Supersedes:** ADR-0001 (Design Language — Material 3 Expressive)
- **Amends:** ADR-0002 (brand seed updated from `#0B57D0` to `#2547B8`)

## 2026-05-11 amendment — "Editorial Bento"

The initial pivot delivered a Greenlight-style minimal-hairlines landing. The founder reviewed it against https://developer.android.com/develop and asked for the same editorial restraint **plus** the Android Develop page's bento pattern: large rounded section cards with their own background tones, bespoke illustrations per section, and TESSAR-specific information shown visually rather than described in body copy.

This amendment formalises:

1. A **curated topic surface palette** — `ink` (near-black + paper-cream text), `paper` (warm off-white), `linen` (cool gray-cream), `sky` (pale blueprint blue) — hand-picked editorial brand colors that are NOT derived from the M3 seed and are NOT M3 tonal roles. They live in `apps/web/lib/theme/topics.css` and are used ONLY for marketing bento cards.
2. A **bento card pattern** — `rounded-3xl`, no border, asymmetric `md:col-span-5/7` rhythm, eyebrow chip + bento title + body + tabular footnote + text CTA + bespoke illustration. Documented in `design-language.instructions.md`.
3. A **bespoke illustration discipline** — inline SVG only, `currentColor` only, content-aware (must show TESSAR domain content like the 9 agent nodes or the 9 deliverable sections), in `apps/web/components/illustrations/`.

App-chrome surfaces (dashboard, run, settings) remain pure editorial restraint — no topic surfaces, no decorative illustration there.

---

## Original context (2026-05-11)

Phase 0 shipped a Material 3 Expressive design system: pillowy shapes, large rounded corners (16–28px), tonal surface containers with subtle elevation tints, candy-bright primary-container backgrounds, and "Expressive" type sizes drawn from M3's tokens.

When the first landing page (the design-system showcase + the marketing hero) was shown to the founder, the response was: **"This is not a design I expected. I wanted design language which is more like https://greenlight.report/"**.

Greenlight.report's language is fundamentally different from M3 Expressive:

| Axis | M3 Expressive | Greenlight (editorial) |
|---|---|---|
| Hero | Centered, bright primary-container gradient | Asymmetric two-column, white background, narrow card on right |
| Headline | "Expressive" sizes, medium weight, neutral tracking | Massive (90–120px), heavy weight (700–900), tight tracking, two-color (black + 1 accent on second line) |
| Cards | Filled tonal surface, no border, soft elevation | White, 1px hairline border, no shadow, large radius (~20px), thin internal divider |
| Section labels | Title-md sentence case | ALL CAPS, tracked, small, muted |
| Color use | Multi-role tonal palette throughout (primary-container, secondary-container, tertiary…) | Near-black on white + ONE accent used sparingly (logo dot, second headline line, CTAs, key inline numbers, ✓ glyphs) |
| Iconography | Material Symbols filled chunky | Small monoline glyphs in pale-tint circles |
| Density | Comfortable | Editorial — generous whitespace, deliberate restraint |

For TESSAR — a serious B2B research tool sold per-run to engineers and architects — editorial restraint is the correct register. M3 Expressive reads as a consumer Android app; engineers buying defensible architecture want a tool that looks like Stripe / Linear / Vercel / Bloomberg.

## Decision

**Pivot the design language to "Editorial Restraint"**, modeled in spirit on Greenlight.report, Linear, Stripe, Vercel.

Specifically:

1. **Type-driven hierarchy, not color-driven.** Big black display type with tight tracking does the heavy lifting. Color is a sparingly-used accent.
2. **Single accent color.** New brand seed: **`#2547B8`** ("cobalt blueprint") — deeper than Stripe blue, distinct from Google blue, signals engineering / architecture / blueprint. Used for: logo mark, second-line of display headlines, primary CTAs, key inline numbers, section labels, ✓ glyphs. Never used for background fills larger than a small badge.
3. **Hairline borders, no shadows.** 1px borders using `outline-variant`. Drop shadows are removed from the design system; depth comes from white-on-pale-gray surface stacking.
4. **Smaller, more conservative radii.** Cards 16px (`rounded-2xl`), buttons 8px (`rounded-lg`), badges/pills full-round for status chips only. The M3 28px "xl-shape" is no longer used.
5. **Editorial type scale.** Display sizes go HEAVIER (700–900 weight) and TIGHTER (`tracking-tight` to `tracking-tighter`) than M3's defaults. ALL CAPS section labels at `text-label-md` with `tracking-wider`.
6. **Asymmetric layouts.** Marketing hero: two-column, content-left, action-card-right. App surfaces: rail + main, no decorative gradients.
7. **Roboto Flex stays** — its variable weight + tightening axes can carry the editorial display register. No new font dependency.
8. **M3 token pipeline stays.** `@material/material-color-utilities` still generates the tonal palette from the seed. We just consume *fewer* roles (primary, on-surface, on-surface-variant, surface-container-low, outline-variant — and that's mostly it).
9. **Motion stays restrained.** Spring presets in `lib/motion/springs.ts` remain, but `expressiveOvershoot` is retired. Page transitions become quiet shared-axis fades. No bouncy, no playful.
10. **Material Symbols stays** as the icon set — but used at smaller sizes (16–20px), monoline weight 300–400 (not the chunky filled variant), and only when an icon adds information.

## Alternatives Considered

- **Keep M3 Expressive, adjust colors only** — rejected. The pillowy/candy aesthetic is intrinsic to Expressive and does not match the founder's mental model of "a serious tool engineers pay per run for."
- **Hybrid: editorial marketing, M3 app surfaces** — rejected. Two design languages in one product is a maintenance and brand-coherence trap.
- **Adopt shadcn/ui defaults verbatim (radix + Tailwind, no design opinion)** — rejected. Too generic; doesn't differentiate.
- **Build on Linear's design language directly** — rejected. Too dark-mode-first; we want strong light-mode editorial first.

## Consequences

**Easier:**
- Cleaner visual brand differentiation in a market full of M3-styled AI tools.
- Faster page builds — fewer decorative surfaces, fewer M3-specific component customizations.
- Type and content do the work, which forces clarity in copy.

**Harder:**
- The 8 M3 components shipped in Phase 0 (button, icon-button, fab, chip, card, input, wavy-progress, sheet) need to be reskinned. Their behavior and APIs stay; their visual treatment changes (smaller radii, hairline borders, no shadows, restrained color use).
- Some M3-specific components retire entirely from the marketing surface (no FAB on landing pages; FAB stays as an option for app surfaces only).
- Design-system showcase at `/design-system` needs to be re-rendered against the new style.

**Follow-up:**
- Update `design-language.instructions.md` to reflect the pivot.
- Regenerate `tokens.generated.css` from the new seed.
- Reskin the 8 M3 components in a follow-up commit; do not block landing-page rebuild on this.
- Re-evaluate after Phase 1 user feedback (≥5 sessions).

## References

- Inspiration: https://greenlight.report/, https://stripe.com/, https://linear.app/, https://vercel.com/
- ADR-0001 (superseded)
- ADR-0002 (amended — new seed)
- IMPLEMENTATION.md §1 (Design language section will be updated)
