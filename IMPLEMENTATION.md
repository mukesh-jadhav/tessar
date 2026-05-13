# TESSAR — Implementation Plan

> Companion to [PLAN.md](PLAN.md) and [MVP.md](MVP.md). This document is the **end-to-end build plan**: how we'll execute, in what order, with what we'll have to show at each step. UI is built first.

---

## 0. Guiding Principles

1. **UI-first.** Build clickable, designed screens with mocked data before wiring intelligence. The experience is the product.
2. **Design language: Material 3 Expressive** (see §1).
3. **One vertical slice at a time.** Each phase ends with something demoable end-to-end at that phase's depth.
4. **Mock until proven.** Every backend dependency starts as a mock with realistic data; replaced only when the UI consuming it is settled.
5. **Eval before launch.** No paid checkout flips on until the eval harness clears the agreed bar.
6. **Cloud-portable shape.** Even though we're on GCP, keep code free of GCP-specific imports outside thin adapter layers (storage, queue, secrets, LLM).
7. **Reversible decisions stay reversible.** Locked decisions in [MVP.md](MVP.md#L320) §9 are *strong defaults*, not religion.

---

## 1. Design Language — Material 3 Expressive

### 1.1 What We Adopt

- **Color system:** Material 3 dynamic color with a content-driven seed (TESSAR brand color → tonal palette → light + dark schemes via Material Color Utilities).
- **Typography:** M3 Expressive type scale — larger display sizes, expressive headlines, varied weights. Default font: **Roboto Flex** (variable, supports all M3 axes) with **Google Sans Code** for code/diagrams.
- **Shape:** Expressive shape scale — generous corner radii (12–28px), asymmetric shapes for hero surfaces (e.g., the run progress card).
- **Motion:** M3 Expressive springs (not eases) for state transitions; large containers expand with overshoot; emphasized motion for the "decisions converging" animation in the run view.
- **Elevation & surfaces:** M3 surface tones (no harsh shadows); use surface containers (`surface-container-low/high/highest`) to layer hierarchy.
- **Components we lean on:** Filled buttons, FAB extended, segmented buttons, top app bar (small + large), navigation rail (desktop) / bottom nav (mobile), cards (filled + elevated), chips (assist + filter), progress indicators (linear wavy + circular), bottom sheets, snackbars.

### 1.2 How We Implement on Web

- **Skeleton:** Next.js 15 + **Tailwind CSS** + **shadcn/ui** (unstyled, accessible primitives — give us behavior; we re-skin to M3).
- **Tokens:** Generate M3 design tokens (color, shape, type, motion) from our seed using **Material Color Utilities** (`@material/material-color-utilities`); export as CSS custom properties + a Tailwind theme extension.
- **Selective MWC:** Use `@material/web` for components where Expressive's motion is hard to recreate (linear progress wavy, FAB, ripple), wrapped as React components.
- **Icons:** **Material Symbols** (variable font, supports filled/outlined/rounded variants and weight axis).
- **Motion:** **Motion** (formerly Framer Motion) configured with M3 Expressive spring presets we define once.
- **Diagrams:** Mermaid themed with our M3 color tokens (one custom Mermaid theme file).

### 1.3 Design Artifacts Produced in Phase 1

- Brand seed color + dark/light tonal palettes
- Type scale + font setup
- Shape & motion token files
- Figma file (or equivalent) with all key screens at desktop + mobile breakpoints
- A `design-system/` Storybook with every component we'll use, themed

---

## 2. Phased Plan (Overview)

| Phase | Theme | Deliverable | Backend involvement |
|---|---|---|---|
| **0** | Foundations | Repo, CI, design tokens, Storybook | None |
| **1** | UI prototype | Clickable, designed end-to-end flow with mock data | None (mocks only) |
| **2** | Backend skeleton | Real DB, auth, run records, fake "agent" produces canned output | Real Postgres, fake orchestrator |
| **3** | Real intelligence | LLM router, KB, research, synthesis, diagrams, cost | Real orchestrator |
| **4** | Monetize & harden | Stripe, observability, security, eval harness in CI | Production-shape |
| **5** | Closed beta | 10 invited users, KB & prompt tuning | Real users, real money in test mode |
| **6** | Public launch | Marketing site, paid checkout live | Live |

Each phase has a hard **Definition of Done** below. We do not start phase N+1 until phase N's DoD is met.

---

## 3. Phase 0 — Foundations

**Goal:** A repo and toolchain that won't have to be rebuilt later.

### 3.1 Tasks

- Monorepo init (per [MVP.md](MVP.md#L267) §6) using **pnpm workspaces**.
- `apps/web` — Next.js 15 + TypeScript + Tailwind + shadcn/ui scaffold.
- `apps/orchestrator` — Python 3.12 + Poetry/`uv` + LangGraph + Pydantic skeleton (just imports, no logic).
- `packages/shared-schemas` — Pydantic models in Python, generated to JSON Schema → TypeScript types via `json-schema-to-typescript`.
- `packages/prompts` — empty registry with a versioning convention.
- `kb-seed/` — directory with one example YAML for schema validation.
- `infra/terraform/` — empty modules (`network`, `data`, `compute`, `edge`) and `envs/{dev,prod}` shells.
- `infra/docker-compose.yml` — Postgres 16 + pgvector, Redis 7, fake-gcs-server, Pub/Sub emulator, Mailpit (for local email).
- `.github/workflows/` — `pr.yml` (lint, type-check, build, unit tests) and `main.yml` (placeholder for deploy).
- ESLint + Prettier + Ruff + mypy + Husky pre-commit.
- ADR template in `docs/adr/`; record first ADR: "Material 3 Expressive on web via Tailwind + shadcn + MWC selective."

### 3.2 Design System Bootstrap

- Generate M3 tokens from seed color → `apps/web/lib/theme/tokens.css` + `tailwind.config.ts` extension.
- Install Roboto Flex + Material Symbols; verify variable-font axes work.
- **Storybook** in `apps/web` with: typography specimen, color palette, shape scale, motion lab (spring presets), elevation/surface samples.
- Build & theme 8 base components in Storybook: `Button`, `IconButton`, `TextField`, `Card`, `Chip`, `LinearProgress` (wavy via MWC), `TopAppBar`, `NavigationRail`.

### 3.3 Definition of Done

- `pnpm dev` brings up web + Storybook locally; `docker compose up` brings up all backing services.
- CI is green on a fresh PR.
- Storybook published (Chromatic or GitHub Pages) showing the 8 base components in light + dark.
- One ADR merged.

---

## 4. Phase 1 — UI Prototype (the "looks real" milestone)

**Goal:** A user can click through the entire TESSAR experience as if it were live. Every screen is final-quality. All data is mocked.

This is where we **finalize how it all looks** before writing a line of agent code.

> **Design lock (2026-05-11):** the `/decide` result view and `/` landing are
> design-locked. Output-shape requirements surfaced during prototyping are
> codified in [ADR-0004](docs/adr/0004-design-lock-agent-output-contract.md)
> and `packages/shared-schemas/`. Phase 2 fixtures and Phase 3 agents must
> validate against those schemas.

### 4.1 Screens to Design & Build (in this order)

1. **Landing / marketing** (single page) — hero, three-step explainer ("Describe → Research → Design"), sample output preview, pricing, sign-in CTA.
2. **Sign in** — email magic link + Google button. Material expressive card-on-surface layout.
3. **Empty dashboard** — "Start your first run" hero card; later, list of past runs.
4. **New Run — Brief screen** — text area (large, expressive) + collapsible "Guide me" wizard panel + cloud preference + budget chip group + submit FAB.
5. **Checkout handoff** — pre-Stripe summary card, "Continue to payment" button (mocked).
6. **Run page — Live progress** — the most distinctive screen:
   - Large hero card with current phase + wavy linear progress
   - Live timeline of events (left rail)
   - "Decisions so far" panel (right) — animated chips appearing as decisions converge
   - Sources consulted — scrollable list with favicon + snippet
   - Inline clarifying-question card when needed (bottom sheet on mobile)
7. **Run page — Result (tabbed package)** — tabs: Summary, Requirements, Architecture, BOM, Trade-offs, Cost, Risks, Build Plan, Audit. Each tab fully designed with realistic mock content.
8. **Architecture tab** — Mermaid diagrams rendered with our M3 theme; tabs for Context / Container / Data Flow / Sequence; "Open in full screen" + "Export SVG."
9. **BOM tab** — table of components with category, choice, alternatives, monthly cost, citation chips, confidence indicator.
10. **Trade-offs tab** — ADR cards with options-considered / why-chosen / sources.
11. **Cost tab** — at-launch / 10×-scale / 100×-scale toggle; sensitivity sliders.
12. **Audit tab** — prompts used, model versions, KB snapshot id, full source list with snapshot dates.
13. **Run history** — card grid with status pill, brief snippet, created/completed timestamps, re-run button.
14. **Account & billing** — runs purchased, payment history, sign-out.
15. **Empty / loading / error states** for every screen.
16. **404 / unauthorized**.

### 4.2 Mock Data

- `apps/web/lib/mocks/` — typed mock fixtures matching `shared-schemas`.
- A mock SSE server (Next.js route handler) that **replays a recorded run** (timed events) so the live progress view feels real.
- 3 fully fleshed-out sample design packages (different domains within SaaS) so the result tabs aren't repetitive when demoed.

### 4.3 Interaction & Motion

- Page transitions via M3 expressive shared-axis motion.
- Progress events animate in with springs, not fades.
- "Decision converging" — chip morphs from outlined → filled with a satisfying spring when confidence crosses threshold.
- Diagram render has a brief draw-on animation (Mermaid SVG path-length trick).
- Theme toggle (light/dark) with smooth color transition.

### 4.4 Accessibility & Responsiveness

- Tested at 360px, 768px, 1280px, 1920px.
- Keyboard-navigable; visible focus rings using M3 focus indicators.
- Color contrast meets WCAG AA in both light and dark schemes (M3 tonal palettes give us this for free if we use the right tone roles).
- Reduced-motion respected (springs collapse to fades).
- Screen-reader labels on icon buttons, live regions for SSE updates.

### 4.5 Definition of Done

- A reviewer can click through Landing → Sign in → New Run → Pay (mock) → Live progress (replayed) → Result (all tabs) → History — without seeing a single placeholder or untouched state.
- Looks production-quality on desktop and mobile in light and dark.
- Storybook covers every component used in the app.
- Three sample design packages can be shown to potential users for feedback (this is also the **first user-research artifact**).
- **User feedback gate:** show this prototype to 5+ target users; document feedback before starting Phase 2.

---

## 5. Phase 2 — Backend Skeleton (real plumbing, fake brains)

**Goal:** Replace mocks with real backend, but the orchestrator still produces a **canned** design package. End-to-end real flow, just not yet intelligent.

### 5.1 Tasks

- Terraform `dev` environment provisioned: VPC, Cloud SQL (Postgres + pgvector), Memorystore Redis, Pub/Sub, Cloud Storage, Secret Manager, Artifact Registry, Cloud Run skeletons for both services. Workload Identity Federation for GitHub Actions.
- DB migrations (Drizzle on web side + SQLAlchemy/Alembic or raw SQL on worker side — pick one and own it; recommend **Prisma on web** since it owns the schema, **read-only SQLAlchemy on worker**).
- Schema for `users`, `runs`, `run_events`, `run_artifacts`, `kb_*`, `eval_briefs` (per [MVP.md](MVP.md#L150) §3.5).
- **Auth.js** wired up: email magic link via Resend + Google OAuth.
- Run lifecycle API: `POST /api/runs` (creates a `pending` run), `GET /api/runs/:id`, `GET /api/runs/:id/events` (SSE).
- Web → Pub/Sub publish on run create.
- Orchestrator: receive Pub/Sub push, write progress events to Redis Stream + Postgres, **return a canned design package** loaded from one of the Phase-1 fixtures, persist artifacts to Cloud Storage.
- SSE endpoint subscribes to Redis Stream and forwards.
- Result page reads real artifacts from Cloud Storage via signed URLs.
- Run history reads real `runs` table.
- Local dev: orchestrator subscribes to local Pub/Sub emulator; storage to fake-gcs.

### 5.2 Definition of Done

- A logged-in user can submit a brief locally and in `dev` cloud environment, see live progress events animate in (driven by canned event timing), and view a real (canned) design package downloaded from Cloud Storage as PDF + MD.
- All data persists across restarts.
- Stripe is **not yet** wired; runs are free in this phase.
- One restore-from-backup drill done on `dev` Cloud SQL.

---

## 6. Phase 3 — Real Intelligence

**Goal:** The orchestrator actually researches, decides, and produces a real package.

### 6.1 Sub-phase 3a — KB & Retrieval

- KB schema in Postgres (per §3.5 in [MVP.md](MVP.md#L150)).
- Seed loader: parses `kb-seed/*.yaml`, embeds via Vertex AI, upserts into `kb_components` / `kb_patterns` / `kb_reference_archs`.
- Hand-curate first **50 GCP component records** + **15 patterns** + **3 reference architectures**.
- Hybrid retrieval: BM25 (Postgres `tsvector`) + vector (`pgvector`) + cross-encoder rerank (start without rerank; add if eval shows need).
- Unit tests on retrieval quality with a small fixture set.

### 6.2 Sub-phase 3b — LLM Router

- `apps/orchestrator/tessar/llm/` — provider-agnostic `complete()` and `complete_structured()` (returns Pydantic models).
- Adapters: Vertex AI (Gemini), Vertex AI (Anthropic Claude), OpenAI direct.
- Tier policy (A/B/C per [MVP.md](MVP.md#L233) §4.1).
- Per-call: timeout, retry with backoff, fallback to next provider on quota/5xx.
- Token & cost accounting written to `run_events` so the cost dashboard is real.
- Prompt caching keyed by normalized input hash + KB snapshot id.

### 6.3 Sub-phase 3c — Agent Graph

Build agents in this order, each with unit tests on golden inputs:

1. `intake_normalizer`
2. `requirements_extractor` (with the clarification loop — UI already supports it from Phase 1)
3. `research_planner` (decomposes brief into 5–12 research questions)
4. `research_worker` (KB lookup → Tavily → cite → summarize) — runs in parallel
5. `synthesizer` (picks components, writes BOM, scores trade-offs)
6. `architect` (emits Mermaid for C4 + data flow + sequence)
7. `cost_estimator` (Cloud Billing Catalog API + KB SaaS prices)
8. `risk_and_tradeoff_writer` (ADRs)
9. `packager` (assembles MD, renders PDF via WeasyPrint, uploads)

LangGraph wires them. Every node:
- Validates output against a Pydantic schema (rejects ungrounded picks)
- Emits a structured progress event
- Records the prompts/model/sources used

> **Output contract (locked):** per-node, per-edge, and per-decision fields
> required by the UI are listed in
> [ADR-0004](docs/adr/0004-design-lock-agent-output-contract.md). The
> `architect` agent emits 3-tier scale notes + `dataClass` + `failureDomain`
> per node and `kind`/`qps`/`p95`/`retry`/`payload` per edge. The
> `synthesizer` emits `ComponentOption[]` (with `costMul`) for each
> swappable slot. The `risk_and_tradeoff_writer` emits `reversibility`,
> `blastRadius`, and a concrete `revisitAt` trigger per decision. The
> `packager` adds a 6–8 step `flow_narrative` artifact (the "How this
> works" panel + new PDF section). No new graph node — narrative is folded
> into the packager.

### 6.4 Sub-phase 3d — Eval Harness

- 10 golden briefs with hand-graded gold packages (more added later).
- LLM-judge with a senior-architect-written rubric (per [MVP.md](MVP.md#L207) §3.8).
- `pytest evals/` runs locally; nightly GH Action runs full suite, posts score to Slack.
- Promptfoo for prompt diffs on PRs.

### 6.5 Definition of Done

- A real brief produces a real, cited, costed package within 15 minutes.
- Eval suite runs nightly; aggregate score baselined.
- Every component pick traces to a KB record or web source.
- Confidence scores appear in the UI.
- Audit tab shows real prompts, model versions, KB snapshot id, sources.

---

## 7. Phase 4 — Monetize & Harden

**Goal:** Production-ready: payments, observability, security, runbooks.

### 7.1 Tasks

- **Stripe Checkout** + webhook → enqueue run on Pub/Sub. Idempotency keys. Refund flow on run failure.
- **Observability:** OpenTelemetry → Cloud Trace + Cloud Logging; Sentry FE+BE; Grafana Cloud dashboards (per [MVP.md](MVP.md#L290) §5.7).
- **Per-run trace** linked from Audit tab.
- **Alerts** (per [MVP.md](MVP.md#L290) §5.7) wired to email + Slack.
- **Cloud Armor** WAF policy + rate limits on `/api/runs` and `/api/auth`.
- **Security hardening pass** against [MVP.md](MVP.md#L290) §5.8 checklist; fix any gaps.
- **Backups:** automated PITR on Cloud SQL + weekly logical dump to Cloud Storage; **restore drill** documented.
- **Runbook** in `docs/runbooks/`: stuck Pub/Sub backlog, LLM provider outage, Stripe webhook replay, Cloud SQL failover, key rotation.
- **Cost guardrails:** per-run token budget enforced; daily LLM-spend Cloud Monitoring alert.
- **`prod` Terraform env** provisioned and deployed via main pipeline.
- **Privacy & ToS:** draft, reviewed, published; cookie banner where required by user geo.

### 7.2 Definition of Done

- Paid run works end-to-end in `prod` with test cards.
- All §5.8 security items checked off.
- Restore drill passed.
- Runbook reviewed.
- Eval score ≥ agreed bar (Open Decision #4 in [MVP.md](MVP.md#L344)) on three consecutive nightly runs.

---

## 8. Phase 5 — Closed Beta

**Goal:** Real users, real feedback, with a safety net.

### 8.1 Tasks

- Invite 10 hand-picked users (ideally 5 founders, 3 architects, 2 students) — they run for free with a code, but flow through real Stripe (zero-amount or coupon).
- Feedback channel: in-app + scheduled call after first run.
- Daily review: eval scores, run failure rate, LLM cost, qualitative feedback.
- Weekly: KB tuning (add components users wanted), prompt tweaks, UX fixes.
- Track: NPS, % of runs exported, % of runs where user asked for a re-run.

### 8.2 Definition of Done

- ≥ 80% of beta users complete at least one run.
- ≥ 60% would recommend (NPS proxy).
- No P0 bugs open.
- Median run cost (LLM + APIs) is within target margin against a known price point (Open Decision #1).
- KB has grown to ≥ 200 components based on real use.

---

## 9. Phase 6 — Public Launch

### 9.1 Tasks

- Marketing site polish; sample-output gallery; pricing page.
- Stripe live mode; coupon system for launch promos.
- Analytics events confirmed (PostHog funnels: landing → sign-in → brief submitted → paid → completed → exported).
- Launch checklist: status page (statuspage.io free tier), support email + canned responses, Defender-equivalent alerts active, on-call rotation (even if it's just you).
- Soft launch (HN/X/LinkedIn/relevant Slack communities) → measure → iterate before paid acquisition.

### 9.2 Definition of Done

- Public can sign up, pay, and receive a package.
- Status page is green and monitored.
- First 10 paid runs reviewed for quality; no refund-worthy issues.

---

## 10. Workstreams That Run Continuously

These don't fit into a single phase; they accrue from Phase 0 onward.

- **KB curation** — weekly review; freshness SLA: every record re-verified at least every 90 days.
- **Eval bar** — score must trend up or stay flat; regressions block merges.
- **Prompt versioning** — every prompt change is a PR with eval delta.
- **Cost-per-run tracking** — dashboard reviewed weekly; tier any node that's drifting up.
- **User-feedback loop** — even in beta and post-launch, every dissatisfied run gets a manual review.

---

## 11. Roles & Time Allocation (solo / small team shape)

If solo, expect this allocation roughly:

- 30% UI/UX (heavy in Phases 0–1, lighter later)
- 35% Orchestrator, KB, prompts (heavy in Phase 3)
- 15% Infra, deploy, security (steady through 0, 2, 4)
- 10% Evals & quality (continuous)
- 10% Sales, content, user research (front-loaded in Phase 1's user-feedback gate, then continuous)

If you bring on help: a designer for Phase 1, a backend engineer for Phase 3, are the two highest-leverage hires.

---

## 12. Risks Specific to the Plan (and mitigations)

| Risk | Mitigation |
|---|---|
| UI feels great but real LLM output looks ugly inside it | Phase 1 fixtures are written by hand to *intentionally* set the bar real outputs must meet; eval harness penalizes poor formatting |
| M3 Expressive on web is harder than expected | Hybrid plan (Tailwind + shadcn + selective MWC); ADR documents fallback to plain M3 if Expressive specifics block us |
| Scope creep into v1.x features mid-Phase 3 | DoD gates are hard; new ideas go into a `BACKLOG.md`, not into the current phase |
| Eval bar never gets crossed | Pre-define what "good enough" means (Open Decision #4) before Phase 3 starts; if not crossed in 4 weeks of tuning, revisit anchor domain or model tier |
| Vertex AI quota / Gemini regional gaps | Fallback to Claude-on-Vertex, then OpenAI direct (already designed in router) |
| Stripe / billing edge cases (refunds, double-charges) | Phase 4 includes idempotency + refund flow + manual reconciliation runbook |
| Prompt-injection from scraped content | Already in [MVP.md](MVP.md#L290) §5.8 + §3.9; included in Phase 3 worker tests with adversarial fixtures |

---

## 13. Order Summary (one-screen view)

```
Phase 0  Foundations           → Repo + design tokens + Storybook + 8 components
Phase 1  UI prototype          → All screens, mock data, replayed live progress, user feedback gate
Phase 2  Backend skeleton      → Real DB + auth + canned package, end-to-end flow
Phase 3  Real intelligence     → KB + LLM router + agents + evals → real packages
Phase 4  Monetize & harden     → Stripe + observability + security + runbooks
Phase 5  Closed beta           → 10 users, tune, measure
Phase 6  Public launch         → Live, measured, supported
```

---

## 14. What We Need To Decide Before Phase 0 Starts

These are the same Open Decisions from [MVP.md](MVP.md#L344) §10, restated here as gates:

1. **Pricing point** — affects Stripe setup and per-run cost-margin alarms in Phase 4. Needed before Phase 4; ideally Phase 1 user research informs it.
2. **GCP region** — needed before Phase 2 (Terraform `dev` provisioning). Recommend `asia-south1` if you're in India and most early users are too; `us-central1` for broadest Vertex AI model availability.
3. **Google for Startups Cloud Program application** — submit before Phase 2 to avoid paying for `dev` infra unnecessarily.
4. **Eval bar** — hard number agreed before Phase 3 ends.
5. **Brand seed color** — needed at the start of Phase 0 to generate M3 tokens. (New here.) Suggest picking 2–3 candidates and seeing tonal palettes before locking.

---

*This plan is the contract. Phases gate on Definitions of Done, not dates. We move when we're ready, not when the calendar says so.*
