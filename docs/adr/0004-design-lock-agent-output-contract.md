# ADR-0004: Phase-1 design lock — agent output contract

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** TESSAR core
- **Supersedes:** none

## Context

Phase 1 of [IMPLEMENTATION.md](../../IMPLEMENTATION.md) is now design-locked: the
`/decide` result view is the canonical post-run experience and the `/` landing
is the canonical pre-sign-in pitch. While building `/decide` end-to-end with
mock data, several output fields surfaced that the agent graph in
[MVP.md](../../MVP.md) §3.4 does not yet contractually emit. Locking them now
prevents Phase 3 agents from being built against a contract narrower than the
UI consumes — which would force either UI regression or a second schema pass.

The mock revealed the UI relies on richer per-component, per-edge, and
per-decision metadata than the original agent contract specified, plus a new
narrative artifact ("How this works") that explains the request lifecycle.

This ADR does **not** change TESSAR's own infrastructure (still GCP per
[architecture.instructions.md](../../.github/instructions/architecture.instructions.md))
nor the agent **graph shape**. It only expands what each existing node emits.

## Decision

Lock the following as the agent output contract for Phase 3, codified as Zod
schemas in `packages/shared-schemas/` and as Pydantic models in
`apps/orchestrator/tessar/schemas/`.

### 1. `architect` node — enriched per-node and per-edge metadata

Each component node in the architecture output must include:

- `id`, `label`, `sub` (one-line role)
- `zone` — one of `client | edge | app | data | external`
- `icon` — token name from the icon set
- `dataClass` — `public | internal | confidential | regulated`
- `failureDomain[]` — IDs of nodes whose failure cascades from this node
- `why` — one-paragraph justification grounded in a KB record or web source
- `scale` — exactly **three** tiers: `1×`, `10×`, `100×`, each with a `note`
- `alts` — short string listing the considered alternatives
- `scaleChip?` — optional one-line capacity headline (e.g. "10k RPS")

Each edge must include:

- `from`, `to`
- `kind` — `sync | async | data | external`
- `label?`, `qps?`, `p95?`, `retry?`, `payload?`

### 2. `synthesizer` node — swap-aware component options

For every node where the synthesizer considered alternatives, emit
`ComponentOption[]` (default option first):

- `id`, `label`, `sub`, `note`
- `costMul` — multiplier vs the default (1.0 = default)
- `remove?: boolean` — option represents removing the component

This enables the `/decide` swap popover to recompute total cost client-side
without re-running the orchestrator. **The first MVP cut keeps swaps
client-side only**; a follow-up may trigger partial re-runs.

### 3. `risk_and_tradeoff_writer` node — reversibility metadata per decision

Each decision must include:

- `id`, `topic`, `pick`, `vs`, `why`, `conf` (`low|med|high`), `cite`
- `reversibility` — `1-way | 2-way`
- `blastRadius` — `service | data | platform`
- `revisitAt` — concrete trigger that should re-open this decision

### 4. `packager` node — flow narrative artifact

The packager assembles a new artifact: `flow_narrative.steps[]`, an ordered
6–8 step request-lifecycle explainer. Each step:

- `id`, `title`
- `nodes[]` — IDs of architect nodes touched in this step
- `body` — 2–4 sentence explanation of *what happens and why*

This is rendered both in the result UI ("How this works" panel under the
architecture diagram) and in the exported PDF (new "How it works" section
between the architecture diagram and the BOM).

## Alternatives Considered

- **Add a new `flow_narrator` node** — rejected. The narrative is a
  natural-language synthesis of artifacts the synthesizer + architect already
  produced; folding into `packager` keeps the graph at 9 nodes and avoids an
  extra LLM call.
- **Defer the schema lock to Phase 3** — rejected. Phase 2 needs a stable
  contract to write canned fixtures against; Phase 3 needs it to validate
  agent outputs. Locking now removes a future migration.
- **Re-run orchestrator on every component swap** — rejected for MVP. Cost
  per re-run is the same as a full run; UX latency would balloon. Client-side
  cost recomputation via `costMul` covers the 80% case and is honest about
  what changed.

## Consequences

**Easier:**

- Phase 2 fixtures can be hand-written against the locked Zod schemas.
- Phase 3 agents have unambiguous output shapes; failures of validation are
  immediate and visible.
- The PDF packager has a richer source of truth — the rendered PDF gains the
  "How it works" section, scale tiers per component, and reversibility
  metadata per decision automatically.

**Harder:**

- The `architect` agent must produce three scale tiers per node; this is an
  extra prompt step but maps cleanly to KB records.
- The `risk_and_tradeoff_writer` must emit `revisitAt` triggers, which
  requires the prompt to elicit *concrete* signals (not vague advice). This
  is added to the prompt registry and gated by an eval.
- Component-swap UX is honest about being client-side: the displayed cost
  delta is a heuristic, not a re-grounded estimate. A copy line in the
  popover surfaces this.

**Follow-up work:**

- Update [MVP.md](../../MVP.md) §3.4 (agent graph) and §3.5 (data model)
  to reference this ADR for the per-node/edge/decision schemas.
- Update [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §6.3 (Phase-3 agent
  graph) to call out the contract this ADR locks.
- Add `flow_narrative` to the eval rubric (rewards: nodes referenced in
  steps must exist; total step count 6–8; each step ≤ 4 sentences).
- Add a promptfoo case for the `revisitAt` field — rejects vague outputs
  ("if scale grows", "as needed") in favor of concrete triggers
  ("DB > 5 TB", "p95 latency > 500 ms for 10 minutes").

## References

- [MVP.md](../../MVP.md) §3.4, §3.5
- [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §4, §6
- [apps/web/app/decide/page.tsx](../../apps/web/app/decide/page.tsx)
  — the design lock this contract is derived from
- ADR-0001 (Material 3 Expressive)
- ADR-0003 (Pivot to editorial design language)
