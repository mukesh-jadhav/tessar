# ADR-0006: Expand MVP package to include system-design narrative

- **Status:** Accepted
- **Date:** 2026-05-15
- **Supersedes:** none
- **Related:** [MVP.md](../../MVP.md) §1.1 (in-scope features), §3.4 (agent graph), §8 (DoD); [.github/instructions/product-goals.instructions.md](../../.github/instructions/product-goals.instructions.md); [docs/roadmap/vision.md](../roadmap/vision.md)

## Context

The locked MVP package contained one architecture diagram (C4), one data-flow, and one sequence diagram, plus ADRs / BOM / cost / risks / build plan. Through user dialogue (2026-05-15), the gap surfaced: the package told users **what** to build but only thinly explained **how the chosen components fit together** — write paths, read paths, integration contracts, what fails first, what to build first. A senior engineer reading the package still had to do the assembly thinking themselves.

The original instinct was to bundle this into a higher pricing tier (₹5000 production tier) alongside IaC, runbooks, and observability. That conflated two distinct things:

1. **Richer narrative** — more prose + more diagrams + same export pipeline. No new generators.
2. **Production bundle** — IaC, runbooks, observability, threat model. New generators, new evaluation infrastructure, ~6 months of additional engineering.

(2) is correctly post-MVP and now lives in [docs/roadmap/vision.md](../roadmap/vision.md) as v2.0.

(1) is small enough to absorb into MVP and large enough to materially raise the per-run value.

## Decision

Expand the MVP `RunPackage` deliverable with five narrative sections produced by enhanced `architect` and `synthesizer` agents (no new agents added):

1. **Three sequence diagrams** instead of one — write path, read path, one critical async/admin path. All Mermaid.
2. **Integration contracts** for each critical edge — message/RPC shape, sync vs async, idempotency notes, retry policy.
3. **"Fits because" component rationale** — 2–3 sentences per critical pick linking it to a specific requirement and citation. (Stronger than the existing one-paragraph `why` on `ArchNode` because it explicitly references the requirement it satisfies.)
4. **Failure-modes table** per critical component — likely failure mode, detection signal, recovery action, target RTO/RPO.
5. **Phased build sequence** — week-1 / week-2 / week-3 ordering of what to stand up first and why. (Distinct from `RoadmapItem`, which is product roadmap; this is engineering-build-order.)

Pricing remains **single tier** at MVP per [MVP.md](../../MVP.md) §9. The richer package raises per-run value, which raises the defensible single-tier price. Tier introduction stays a Phase-5-data-driven decision per the tiering principle in [docs/roadmap/vision.md](../roadmap/vision.md) §3.

## Consequences

### Schema changes (TypeScript landed now; Pydantic mirrors when Phase 3 starts)

`packages/shared-schemas/index.ts` `RunPackage` gains:

- `sequenceDiagrams: SequenceDiagram[]` — exactly 3 required (write / read / async-or-admin)
- `integrationContracts: IntegrationContract[]` — one per edge marked critical by the architect
- `componentRationales: ComponentRationale[]` — one per critical node
- `failureModes: FailureMode[]` — one per node with `failureDomain.length > 0`
- `buildSequence: BuildPhase[]` — 3–6 phases, each with sequenced node IDs

The existing `flowNarrative: FlowStep[]` (ADR-0004) is **kept**. `flowNarrative` explains the runtime lifecycle holistically; `sequenceDiagrams` show three specific paths; they are complementary, not redundant.

### Agent graph

No new nodes. `architect` agent's prompt + output schema expand to fill the new fields. `synthesizer` stitches them into the PDF in a new "How this fits together" section after the architecture diagram. Per-run LLM budget cap raises ~30%; updated in [MVP.md](../../MVP.md) §5.7 alongside this ADR.

### Eval surface

Five new graders (one per added section) for prose coherence + grounding. Eval bar (already a Phase 3 deliverable) absorbs the new graders before paid checkout flips on.

### Out of scope (still)

- Working IaC, runbooks, observability blueprint, threat model, data model, CI/CD pipeline, cost-optimisation playbook — all v2.0 (production bundle), not MVP. See [docs/roadmap/vision.md](../roadmap/vision.md) §2.
- Multi-tier pricing — still single tier at launch.
- API access, team workspaces, etc. — unchanged from MVP exclusion list.

### Pricing implication

The defensible single-tier price band moves from "around ₹500–₹1000" (loose pre-Phase-1 guess) to **₹1500–₹2500** for the richer package. Final number remains a Phase-5 data-driven decision; see open decision #1 in [MVP.md](../../MVP.md) §10.

## Alternatives considered

1. **Ship original MVP, add narrative as v1.1.** Rejected: the richer narrative is what makes the package feel "decided" rather than "described." Gating it behind a future release weakens the launch claim.
2. **Add narrative _and_ IaC/runbooks/etc. to MVP (the ₹5000 production tier as originally proposed).** Rejected for the reasons in [docs/roadmap/vision.md](../roadmap/vision.md) §2 and the cost/eval surface arguments captured in chat 2026-05-15: ~6 months of additional engineering, new evaluation infrastructure per generator, and zero willingness-to-pay data to defend the cuts.
3. **Keep one sequence diagram but add the failure-modes table and build sequence only.** Rejected: write/read path separation is the highest-value addition by user signal; cutting it leaves the obvious gap.
