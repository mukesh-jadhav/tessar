# @tessar/web

Next.js 15 + TypeScript application: UI, API routes, auth, billing webhooks, SSE endpoint. Deploys to Cloud Run.

See [.github/instructions/architecture.instructions.md](../../.github/instructions/architecture.instructions.md) and [.github/instructions/design-language.instructions.md](../../.github/instructions/design-language.instructions.md).

## First-time setup

```bash
pnpm install
pnpm gen:tokens   # generates lib/theme/tokens.generated.css from the brand seed
pnpm dev
```

## Layout

- `app/` — Next.js App Router routes
- `components/` — React components (added in Phase 1)
- `lib/theme/` — Material 3 token pipeline (`seed.ts` is the single source of truth)
- `lib/motion/` — M3 Expressive spring presets
- `lib/diagrams/` — Mermaid theme bound to M3 tokens
- `scripts/` — build-time scripts (token generator, etc.)

## Anti-drift

Do not introduce raw hex colors, ad-hoc font sizes, ease-curve transitions, or non-M3 component libraries. See the design-language skill file linked above.
