# TESSAR — Platform Plan

> **Tagline (working):** *Describe your system in plain words. Get a defensible architecture, backed by research, in one run.*

---

## 1. Vision

Modern AI tools answer questions, but designing a real-world software/data/ML/IoT architecture still requires hours (often days) of research: comparing components, weighing trade-offs, validating compliance, sizing infrastructure, and stitching it all into a coherent diagram. TESSAR compresses that work into a single guided run.

A user describes their use case in the simplest possible way (free text, voice, or a short guided form). TESSAR then:

1. **Understands** the intent, constraints, and non-functional requirements.
2. **Researches** candidate components, patterns, and reference architectures from a curated, continuously refreshed knowledge base + live web sources.
3. **Decides** a recommended architecture with explicit trade-offs and alternatives.
4. **Visualizes** the system: components, data flow, deployment topology, sequence flows.
5. **Justifies** every decision with citations, cost estimates, risks, and migration paths.
6. **Delivers** a complete, exportable design package.

Users **pay per run** (with optional subscriptions for teams). Each run is a self-contained, reproducible artifact.

---

## 2. Target Users

| Persona | Pain Today | Why TESSAR |
|---|---|---|
| Solo founder / indie hacker | No architect on team; afraid of picking wrong stack | Validated blueprint for a fixed price |
| Startup CTO | Needs to move fast, justify choices to investors | Defensible doc with trade-offs and cost |
| Enterprise architect | Spends days on RFPs, vendor comparisons | Pre-researched comparison matrices |
| Consultant / agency | Repeats same design work for many clients | Reusable templates, white-label exports |
| Engineering manager | Onboarding a new domain (ML, IoT, blockchain) | Domain-aware patterns + learning path |
| Student / learner | Wants to understand "why this stack" | Annotated, educational output |

---

## 3. Core Value Proposition

- **Research depth, not just generation.** Every recommendation is backed by sources, benchmarks, and pricing data — not just LLM intuition.
- **Decision transparency.** Each component shows: alternatives considered, why rejected, trade-offs, and confidence score.
- **Complete deliverable.** Not a chat transcript — a structured, exportable design package (diagrams, docs, IaC scaffolds, BOM).
- **Pay-per-outcome pricing.** A run produces a tangible artifact; users know what they're paying for.

---

## 4. Product Surface — User Journey

### 4.1 Input Phase — "Describe Easily"

Multiple low-friction entry points; user picks one:

1. **Free-text brief** — A single text box: *"I want to build X for Y users that does Z."*
2. **Guided wizard** — 6–10 progressive questions (domain, scale, budget, compliance, team size, hosting preference, latency needs, data sensitivity, existing stack, time-to-launch).
3. **Voice intake** — Speak the idea; TESSAR transcribes and structures.
4. **Document upload** — PRD, RFP, napkin sketch (image), or existing diagram.
5. **Template start** — "Like Uber for X", "SaaS analytics", "RAG chatbot", "IoT fleet" — pre-filled brief.

**Clarification loop:** TESSAR asks at most 3–5 targeted follow-ups only when a decision is materially blocked. No interrogation.

### 4.2 Research Phase — "Show The Work"

Live progress view (not a black box). User sees:

- **Requirements extracted** (functional, non-functional, constraints).
- **Research threads** spawned in parallel: e.g., *"DB candidates for 10k writes/sec"*, *"GDPR-compliant auth"*, *"Cheapest GPU inference under 200ms"*.
- **Sources consulted** (docs, benchmarks, pricing pages, papers, community threads).
- **Decisions converging** with confidence indicators.

User can **pause, redirect, or constrain** ("must use AWS", "no Kafka"). Constraints feed back into research.

### 4.3 Output Phase — "The Design Package"

A multi-tab, navigable artifact:

1. **Executive Summary** — One page. Problem, recommended architecture, cost band, risks, time-to-build.
2. **Requirements Spec** — Functional + NFRs (latency, throughput, availability, durability, compliance, budget).
3. **Architecture Diagrams**
   - C4 model: Context → Container → Component → Code (where useful).
   - Deployment topology (cloud regions, AZs, networks).
   - Data flow diagram.
   - Sequence diagrams for top user journeys.
4. **Component Bill of Materials (BOM)** — Each row: component, role, chosen tech, alternatives, why chosen, monthly cost estimate, vendor lock-in score, links.
5. **Trade-off Register** — Decision log (ADR-style) with options, criteria, scores, citations.
6. **Data Model Sketch** — Entities, relationships, storage placement, retention policy.
7. **Non-Functional Plan** — Scalability path, observability stack, security model, DR/backup, compliance checklist.
8. **Cost Model** — Monthly cost at launch, at 10×, at 100× scale, with sensitivity analysis.
9. **Risk Register** — Technical, vendor, regulatory, team-skill risks with mitigations.
10. **Build Plan** — Phased roadmap (MVP → v1 → scale), suggested team shape, hiring profile.
11. **Starter Scaffolds** *(optional add-on)* — IaC stubs (Terraform/Pulumi), repo skeleton, CI templates.
12. **Citations & Appendix** — Every claim linked to a source with snapshot date.

### 4.4 Post-Run

- **Versioned re-runs** — Edit constraints, re-run a slice (cheap), or full re-run (full price).
- **Diff view** between runs.
- **Share link / export** — PDF, Markdown, Notion, Confluence, draw.io, Mermaid, JSON.
- **Live update alerts** *(subscription)* — "AWS dropped price for X — your design is now $Y/mo cheaper."

---

## 5. Feature Catalog

### 5.1 Must-Have (MVP)

- Free-text + guided wizard intake
- Requirements extractor with clarification loop
- Multi-agent research orchestrator with live progress
- Curated knowledge base of components (cloud services, OSS, SaaS) with metadata: pricing, limits, compliance, maturity
- Web research with source citation and snapshot
- Architecture generator producing C4 + data flow diagrams (Mermaid / Structurizr DSL)
- Trade-off / ADR generator
- Cost estimator (cloud pricing APIs)
- Markdown + PDF export
- Pay-per-run checkout (Stripe), single-user accounts
- Run history & re-run

### 5.2 Should-Have (v1.x)

- Document/image upload intake (PRD, sketch)
- Voice intake
- Compliance overlays (GDPR, HIPAA, SOC2, PCI, India DPDP)
- Multi-cloud comparison view (AWS vs GCP vs Azure vs OSS-only)
- Vendor lock-in scoring
- IaC scaffold export (Terraform, Pulumi, Bicep)
- Notion / Confluence / draw.io exports
- Team workspaces, role-based sharing
- Run templates marketplace

### 5.3 Nice-to-Have (v2+)

- Live diagram editor with re-justify ("I moved Redis here, is that ok?")
- Continuous design monitoring (price/security/EOL alerts)
- Integration with GitHub: open PR with scaffold
- Architecture review mode: upload existing system, get gap analysis
- White-label / agency mode
- API access for embedding in other tools
- Community-contributed patterns with reputation
- Benchmark sandbox: spin up tiny POC to validate hot-path latency claims
- Compliance auditor handoff (export evidence pack)

---

## 6. System Architecture (of TESSAR itself)

> *To be detailed after this plan is approved — but a sketch:*

- **Frontend:** Next.js (web), eventual mobile. Realtime progress via WebSockets/SSE.
- **Orchestrator:** Agent graph (LangGraph or custom) coordinating: Intake → Requirements → Research planner → Parallel research workers → Synthesizer → Diagrammer → Cost engine → Packager.
- **Knowledge base:** Hybrid — curated component catalog (Postgres + vector index) + live web research (search APIs + scrape + cache).
- **LLM layer:** Multi-model routing (frontier model for synthesis, cheaper for extraction/classification). Self-host for sensitive enterprise tier later.
- **Diagram engine:** Mermaid + Structurizr DSL → SVG/PNG; later a proprietary layout engine for clean topologies.
- **Cost engine:** Adapters for AWS/GCP/Azure pricing APIs + community pricing data for SaaS.
- **Eval harness:** Golden set of briefs with expert-graded designs; regression tests on every model/prompt change.
- **Billing:** Stripe; metered usage for enterprise.
- **Storage:** Postgres (runs, users), S3 (artifacts), vector DB (knowledge), Redis (cache/queues).
- **Observability:** OpenTelemetry across agents; per-run trace visible to user (transparency = trust).

---

## 7. Knowledge Base — The Real Moat

The differentiator is not the LLM; it's the **curated, structured, freshness-tracked catalog**:

- **Component records:** name, category, vendor, pricing model, free tier, regions, compliance certs, SLAs, max throughput, known limits, common pitfalls, replacement candidates, last verified date.
- **Pattern library:** named patterns (CQRS, event sourcing, RAG, lambda arch, hub-and-spoke IoT) with when-to-use, when-not-to-use, real-world examples.
- **Reference architectures:** anonymized blueprints by domain (fintech, healthtech, edtech, IoT, ML platform, marketplace).
- **Benchmark corpus:** independent perf/cost benchmarks with dates and methodology.
- **Decision heuristics:** rule-of-thumb thresholds ("under 1k QPS, don't shard").

Maintained by: ingestion pipelines + small expert curation team + community contributions (gated, reputation-based).

---

## 8. Pricing Model

- **Pay-per-run (primary):** Tiered by depth.
  - *Quick Sketch* — light research, single-cloud, ~10 min — low price point.
  - *Standard Design* — full package, multi-option, ~30 min — mid price point.
  - *Deep Architecture* — exhaustive research, multi-cloud comparison, compliance pack, scaffolds — premium.
- **Re-run discount:** Edit-and-rerun at fraction of original.
- **Team subscription:** Monthly seats + included runs + shared workspace + private templates.
- **Enterprise:** Annual, SSO, audit logs, on-prem KB, custom catalog, SLA.
- **Add-ons:** IaC scaffold, compliance pack, expert human review, live monitoring.

*(Exact price points TBD after pricing research and willingness-to-pay interviews.)*

---

## 9. Trust & Quality

This is the make-or-break dimension. A wrong architecture is expensive.

- **Citations everywhere.** No claim without a source.
- **Confidence scores** per decision; low-confidence items flagged for human review.
- **Eval suite:** golden briefs scored by independent senior architects; published quality metrics.
- **Human-in-the-loop tier:** optional expert review of the generated package before delivery.
- **Disclaimer & scope:** clear statement of what TESSAR is not (not a substitute for security audit, legal review, etc.).
- **Reproducibility:** every run stores prompts, model versions, sources, and KB snapshot — auditable.

---

## 10. Competitive Landscape (initial scan)

- **Generic LLM chats (ChatGPT, Claude):** Wide but shallow; no structured output, no citations, no cost model.
- **Diagramming tools (Lucid, Excalidraw, Eraser AI):** Draw, don't decide.
- **Cloud architecture tools (AWS App Composer, Workload Discovery):** Vendor-locked, no comparison.
- **Consultancies:** Expensive, slow, inconsistent.
- **Dev-focused AI (Cursor, v0, Bolt):** Generate code, not system designs.

**TESSAR's wedge:** structured, cited, multi-vendor, decision-first (not diagram-first or code-first).

---

## 11. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| LLM hallucinates a component or limit | Hard-bind generation to KB; reject ungrounded claims; eval suite |
| KB goes stale | Freshness SLAs per record; automated re-verification crawlers |
| Users want code, not docs | Add scaffold layer; partner with code-gen tools |
| Architecture is subjective; users disagree | Show alternatives & let user re-weight criteria |
| Cost-per-run too high | Cache aggressively; tier model usage; cheaper "sketch" tier |
| Liability for bad designs | Clear ToS; confidence scores; optional expert review tier |
| Enterprise won't send IP to cloud | On-prem / VPC deployment tier |

**Open questions to resolve before build:**

1. Which 3–5 domains do we launch with (to keep KB tractable)?
2. Buy vs build the diagram layout engine?
3. Is the human-review tier core or optional from day one?
4. Do we open the KB (community contrib) early or keep it closed for quality?
5. What's the minimum eval bar before charging?

---

## 12. Phased Roadmap (shape, not timeline)

- **Phase 0 — Validation:** 20 user interviews; 10 hand-crafted designs to define the gold standard output; pricing willingness study.
- **Phase 1 — MVP (closed beta):** Single domain (e.g., SaaS web apps), single cloud (AWS), free-text intake, full output package, manual KB.
- **Phase 2 — Public launch:** Add 2 more domains, multi-cloud, wizard intake, Stripe, exports.
- **Phase 3 — Depth:** Compliance overlays, IaC scaffolds, team workspaces, templates marketplace.
- **Phase 4 — Moat:** Live monitoring, community KB, enterprise tier, API.

---

## 13. Success Metrics

- **Quality:** Expert-graded score on golden briefs ≥ target threshold.
- **User:** % of runs where user exports/shares the package; NPS; repeat-run rate.
- **Business:** Revenue per run; gross margin per run (LLM cost / price); paid conversion from free preview.
- **Operational:** Median time-to-package; KB freshness %; citation coverage %.

---

## 14. Next Steps (proposed)

1. Pick the **first domain** to anchor the MVP.
2. Hand-design **5 reference outputs** for that domain — these become both the gold standard and the shape of the product.
3. Run **10 user interviews** to validate willingness-to-pay and the output format.
4. Draft the **KB schema** and seed the first 100 component records.
5. Build the **orchestrator skeleton** with one end-to-end run on a single brief.
6. Establish the **eval harness** before any paid launch.

---

*This document is a living plan. Treat sections 4, 5, and 7 as the product spine; everything else supports them.*
