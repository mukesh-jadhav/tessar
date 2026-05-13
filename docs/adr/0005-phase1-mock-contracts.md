# ADR-0005: Phase-1 Mock Contracts as Phase-2 Implementation Targets

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** founder

## Context

Phase 1 ships a fully clickable UI prototype with three backend dependencies
mocked at well-defined typed boundaries:

1. **Run progress events** — streamed via Server-Sent Events from
   `/api/mock-runs/[id]/events` to the run-progress page. Defined by the
   `RecordedEvent` discriminated union in
   [`apps/web/lib/mocks/recorded-run.ts`](../../apps/web/lib/mocks/recorded-run.ts).
2. **Past runs** — queried by the dashboard and billing surfaces. Defined by
   the `RunSummary` interface in
   [`apps/web/lib/mocks/past-runs.ts`](../../apps/web/lib/mocks/past-runs.ts).
3. **Sample-package metadata** — used by the `/decide` sample switcher.
   Defined by `SamplePackage` in
   [`apps/web/lib/mocks/sample-packages.ts`](../../apps/web/lib/mocks/sample-packages.ts).

These three boundaries are the seam between the prototype UI and the real
backend that arrives in Phase 2 (skeleton) and Phase 3 (intelligence).
Without an explicit lock, there is a real risk that Phase-2 work invents
new shapes, the consumers re-render against them, and the carefully tuned
Phase-1 UX silently regresses.

## Decision

The three boundary types are **frozen as the implementation contract** for
Phase 2 (and beyond). Specifically:

- **`RecordedEvent` discriminated union** is the wire-format the real Redis
  Streams → SSE bridge must emit. The Phase-2 work replaces only the body
  of `apps/web/app/api/mock-runs/[id]/events/route.ts` (renamed to `/runs/[id]/events`),
  not its event-name set, payload shapes, or sequencing semantics.
- **`RunSummary`** is the row shape returned by `GET /api/runs` and the row
  shape persisted to the `runs` table (with at most additive fields
  prefixed with an underscore for internal use).
- **`SamplePackage`** is replaced by a `RunPackage`-derived projection in
  Phase 3, but until then, the switcher contract on `/decide` keeps the
  same fields (`briefTitle`, `briefOneLiner`, `scaleAssumption`, `persona`).

All three types are also lifted into `packages/shared-schemas` in the first
Phase-2 PR so the Python orchestrator can validate against them via
Pydantic mirrors.

### Pricing constraint (related)

At launch the per-run price is **$10 USD** (set 2026-05-11, see
[`apps/web/lib/pricing.ts`](../../apps/web/lib/pricing.ts)). Phase-3 evals
must keep cost-per-run ≤ $3 USD (LLM + search + storage) to maintain the
target ≥ $5 gross margin after Stripe fees. If evals trend above $3, we
either raise price, downshift LLM tiers, or tighten the agent graph —
the contract types do not change.

## Alternatives Considered

- **Lock nothing; reshape freely in Phase 2** — fastest in the very short
  term, but invites a UI rewrite at Phase-2 end, defeats the build
  philosophy in [IMPLEMENTATION.md](../../IMPLEMENTATION.md), and breaks
  the user-feedback signal we collect now (testing a UI we'll discard).
- **Lock the entire `RunPackage` contract now** — premature; the agent
  outputs are not eval-tested yet, and locking `Decision.alternatives`,
  `BomLine.per`, etc. before Phase 3 risks shipping a contract that
  doesn't reflect what the agents actually produce reliably. ADR-0004
  already locks the *output package* shape; this ADR locks the
  *transport* and *index* shapes.
- **Move SSE to WebSockets** — rejected. SSE is one-way, HTTP/2-friendly,
  trivially proxyable through Cloud Run + Cloud LB, and lower
  operational surface. The shape doesn't differ.

## Consequences

**Easier:**

- Phase-2 backend can be built and tested against the exact same UI
  without a UX freeze or a parallel "mock vs real" toggle.
- The mock SSE route doubles as a Storybook fixture and an offline demo
  channel for sales calls.
- Cost-per-run regression detection (Phase 3) can rely on the metric
  payload shape staying constant.

**Harder:**

- Adding a new event kind requires touching 3 files (the union, the route,
  and the reducer in `/run/[id]/page.tsx`). Acceptable cost for safety.
- If user research uncovers a needed UI surface (e.g. a research-graph
  visualization), the contracts may need an additive field. Additive is
  fine; renaming or removing requires a follow-up ADR.

**Follow-up:**

1. First Phase-2 PR mirrors the three types into
   `packages/shared-schemas` with Zod (web) and Pydantic (worker)
   validators.
2. Phase-2 swap of `/api/mock-runs/[id]/events` → real `/api/runs/[id]/events`
   wired to Redis Streams must include a contract-level test
   (replay the recorded stream, expect identical reducer state).

## References

- [ADR-0004 — Design lock + agent output contract](./0004-design-lock-agent-output-contract.md)
- [`apps/web/lib/mocks/recorded-run.ts`](../../apps/web/lib/mocks/recorded-run.ts)
- [`apps/web/lib/mocks/past-runs.ts`](../../apps/web/lib/mocks/past-runs.ts)
- [`apps/web/lib/mocks/sample-packages.ts`](../../apps/web/lib/mocks/sample-packages.ts)
- [`apps/web/lib/pricing.ts`](../../apps/web/lib/pricing.ts)
- [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §3 (Phase 1 DoD)
- [MVP.md](../../MVP.md) §3 (architecture)
