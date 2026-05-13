# ADR-0006: Phase-1 User-Feedback Gate Closed Offline

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** founder

## Context

[`implementation-discipline.instructions.md`](../../.github/instructions/implementation-discipline.instructions.md)
and [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §4.5 make Phase-1's
user-feedback gate (≥ 5 sessions with target users) a **hard prerequisite**
for starting Phase 2. The capture template at
[`docs/research/phase1-feedback.md`](../research/phase1-feedback.md) is the
intended audit trail.

As of this ADR, that template is empty (`0 / 5` sessions logged), but the
founder confirmed that the feedback sessions were conducted offline and
that the findings have already been internalised. Phase 2 work cannot
start without an explicit decision on this gate, because the discipline
rules say _"drift is the failure mode"_.

## Decision

The Phase-1 user-feedback gate is treated as **satisfied**, on the basis
of offline sessions whose notes are not committed to the repo. Phase 2
work may begin.

The following Phase-1 derived defaults are **not** revisited as part of
this ADR — if any change later, they get their own ADR:

- $10/run pricing ([`apps/web/lib/pricing.ts`](../../apps/web/lib/pricing.ts)).
- B2B SaaS as the MVP domain (per
  [`product-goals.instructions.md`](../../.github/instructions/product-goals.instructions.md)).
- The 9-agent pipeline shown in the run UI (per
  [MVP.md](../../MVP.md) §3.4).
- The `/decide` lens-tab UX, the brief composer's 3-clarify limit, and
  the 14-feature MVP set.
- The Phase-1 mock contracts locked in [ADR-0005](0005-phase1-mock-contracts.md).

## Consequences

**Positive**

- Unblocks Phase-2 (backend skeleton) immediately.
- Keeps the audit trail honest: there is no pretence that
  `phase1-feedback.md` was filled in.

**Negative / risks**

- We have no in-repo record of what users actually said, so future
  product debates can't replay the evidence. If a Phase-2/3 design
  question turns on what users felt about a Phase-1 surface, we may
  have to re-run the relevant session or rely on the founder's recall.
- Future phase gates that depend on artifact-level evidence
  (e.g. eval-harness baseline before Phase 4) **must not** be closed
  this way. Those require committed evidence.

## Follow-ups

- If/when the offline notes are written up, append them to
  [`phase1-feedback.md`](../research/phase1-feedback.md) and link from
  this ADR.
- Phase-3 eval-bar gate and Phase-4 cost-margin gate are explicitly
  **not waivable** by this precedent.
