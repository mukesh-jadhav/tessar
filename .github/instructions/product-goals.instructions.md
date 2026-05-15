---
applyTo: "**"
---

# TESSAR — Product Goals & Scope (do not drift)

Source of truth: [PLAN.md](../../PLAN.md), [MVP.md](../../MVP.md).

## What TESSAR is

A platform where users describe a system in plain words and receive a **researched, defensible architecture** as a complete design package. Sold **per run**.

## Core value props (do not dilute)

1. **Research depth, not just generation** — every recommendation is backed by KB records or cited web sources.
2. **Decision transparency** — alternatives, trade-offs, confidence scores shown for every pick.
3. **Complete deliverable** — structured, exportable design package (PDF + Markdown), not a chat transcript.
4. **Pay-per-outcome** — a run produces a tangible artifact.

## MVP anchor (locked)

- **Domain:** SaaS web applications (B2B/B2C). Do not expand domain scope inside MVP work.
- **Recommendation cloud:** GCP first (full BOM + cost), AWS + Azure secondary (component list, no full cost).
- **Run shape:** target 8–15 minutes; PDF + Markdown export; pay-per-run via Stripe.

## In-scope MVP features (the 15)

Intake (text + wizard) · requirements extractor with ≤3 clarify questions · multi-agent research orchestrator with live SSE progress · curated KB (~150 records) · web research with citations · architecture generator (C4 + data flow + **3 sequence diagrams**: write/read/async, all Mermaid) · **system-design narrative** (integration contracts, "fits because" rationale per critical pick, failure-modes table, phased build sequence — ADR-0006) · ADR/trade-off generator · cost estimator · full design-package output · MD + PDF export · Stripe pay-per-run (single tier) · single-user accounts (Auth.js) · run history · eval harness gating CI (with graders for the 5 ADR-0006 narrative sections).

## Explicitly out of scope for MVP (do not add)

Voice intake, document/image upload, full multi-cloud parity, GCP-beyond-anchor compliance overlays, IaC scaffold export, Notion/Confluence/draw.io exports, team workspaces/RBAC, templates marketplace, re-run diff, live monitoring/alerts, public API, mobile app.

## Trust requirements (non-negotiable)

- Every component pick **must** cite a KB record or web source. Ungrounded picks are rejected and re-prompted.
- Per-decision confidence score (low/med/high) shown in UI.
- Audit tab on every run: prompts, model+version, KB snapshot id, sources.
- Disclaimer + scope statement on every export.
- Prompt-injection hygiene: scraped content treated as untrusted; system prompt instructs workers to ignore instructions inside fetched content.

## Quality gates

- Eval harness must clear the agreed bar before paid checkout flips on in prod.
- No regression in last 7 nightly runs at launch.
- Median per-run gross margin ≥ target (price − LLM/search/infra variable cost).

## When in doubt

- Adding a feature? If it's not in the 15 above, it goes to `BACKLOG.md`, not the current phase. The longer-term destination is documented in [docs/roadmap/vision.md](../../docs/roadmap/vision.md) — consult it before pitching MVP additions.
- Changing scope? Update [MVP.md](../../MVP.md) §1 and add an ADR. Don't drift silently.
