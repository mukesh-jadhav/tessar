# TESSAR — Project Documents Index

Read these in order when onboarding or making decisions:

1. **[PLAN.md](PLAN.md)** — Vision, target users, full feature catalog (MVP / v1.x / v2+), KB strategy, pricing model, competitive landscape, risks, phased roadmap.
2. **[MVP.md](MVP.md)** — MVP scope (the 14 must-have features), system design on **GCP**, locked component choices, deployment, security baseline, build order, Definition of Done.
3. **[IMPLEMENTATION.md](IMPLEMENTATION.md)** — End-to-end phased build plan (UI-first), Material 3 Expressive design language, phase-by-phase DoD gates, workstreams, risks.

## Skill files (auto-loaded by Copilot — anti-drift)

Located in [.github/instructions/](.github/instructions/):

- **product-goals.instructions.md** — what TESSAR is, the 14 MVP features, what's out of scope, trust requirements.
- **architecture.instructions.md** — locked tech stack, GCP services, agent graph, LLM tier policy, security baseline. *Applies to all files.*
- **design-language.instructions.md** — Material 3 Expressive on web, tokens, motion, accessibility, anti-drift rules. *Applies to `apps/web/**`.*
- **implementation-discipline.instructions.md** — build phases, DoD gates, hard rules (no real LLMs before Phase 3, no Stripe live before Phase 6, etc.).

## ADRs

Architectural decisions live in `docs/adr/`. New decisions that change anything in the skill files require an ADR.

## Backlog

Out-of-scope ideas go in `BACKLOG.md` (created when first needed), not into current phase work.
