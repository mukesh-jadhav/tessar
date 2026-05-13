# ADR-0008: Phase-3 eval bar and harness design

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** Mukesh

## Context

Per `.github/instructions/product-goals.instructions.md` and [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §6:

> "Eval harness must clear the agreed bar before paid checkout flips on in prod."

Phase 3 builds the real 9-agent pipeline. Without an objective quality bar agreed _before_ the pipeline is finished, we cannot:

1. Decide when Phase 3 is "done".
2. Detect prompt/model regressions in CI.
3. Justify flipping Stripe live in Phase 6.

We also need a **harness** — a reproducible way to score the system end-to-end on representative briefs.

## Decision

### 1. The bar (locked unless superseded)

A run **passes** if it scores **≥ 7.0 / 10** weighted average across the rubric below, AND no individual axis scores < 4.

The **suite passes** if **≥ 80 % of scenarios pass** AND aggregate weighted score is **≥ 7.5 / 10**.

CI gate: any PR that drops the suite aggregate by **> 0.5 absolute points** vs the baseline-on-main fails the merge check.

Phase 3 DoD: 3 consecutive nightly runs of the live pipeline meet the suite bar against the seed scenarios.

### 2. Rubric (6 axes, 0–10, weighted)

| #   | Axis                       | Weight | What it measures                                                                                                                                                                                                                            |
| --- | -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Groundedness**           | 25 %   | Every component pick cites a KB record or web source. Auto-checkable: count picks with empty `sources[]`.                                                                                                                                   |
| 2   | **Schema validity**        | 15 %   | Final package + every agent output validates against Pydantic schemas in `packages/shared-schemas/`. Binary at the agent level, averaged. Auto-checkable.                                                                                   |
| 3   | **Architecture coherence** | 20 %   | Components fit together (e.g. picked Postgres + pgvector, not Postgres + Pinecone for vectors); Mermaid C4 + data-flow + sequence diagrams render and are internally consistent. **LLM-judge** with a checklist prompt + spot human review. |
| 4   | **Trade-off transparency** | 15 %   | Each major decision lists ≥ 2 alternatives with stated reason for rejection; confidence pill present. Auto-checkable on schema, judged on quality.                                                                                          |
| 5   | **Cost realism**           | 10 %   | BOM line items have cost figures that fall within ±50 % of the KB record's published unit cost. Auto-checkable.                                                                                                                             |
| 6   | **Brief fidelity**         | 15 %   | Recommendation actually addresses the user's stated requirements (no hallucinated requirements, no missed must-haves). **LLM-judge** with checklist generated from extracted requirements.                                                  |

Weights chosen so that **groundedness + schema validity + cost realism = 50 %** are auto-checkable, making the bar resistant to LLM-judge drift.

### 3. Scoring mechanics

- Auto-checkable axes (1, 2, 5): pure Python checks against the run's persisted artifacts and `run_events`. Deterministic.
- Judged axes (3, 4, 6): a Tier-A model (Gemini Pro) acting as judge with a fixed system prompt, a per-axis rubric, and **chain-of-thought required**. The judge sees: brief, extracted requirements, final package, list of cited sources. It does NOT see prompts or intermediate reasoning.
- Each judged score is averaged over **2 independent judge calls** to dampen variance.
- Optional: weekly human spot-grading of 5 random scored runs to detect judge drift.

### 4. Harness layout

```
evals/
├── scenarios/             # YAML scenario specs (brief + must-haves + nice-to-haves)
│   ├── 001-b2b-saas-crm.yaml
│   ├── 002-fintech-realtime-feed.yaml
│   └── 003-marketplace-mvp.yaml
├── rubric/
│   ├── checks.py          # auto-checkable axis implementations
│   └── judge_prompts/     # versioned judge prompts (tier-A)
├── runners/
│   ├── run_suite.py       # CLI: load scenarios → fire runs → score → emit JSON report
│   └── score_run.py       # score a single completed run by ID
└── reports/               # JSON + Markdown reports, gitignored except baseline.json
```

### 5. CI integration

- **PR gate (`.github/workflows/pr.yml`)**: runs only auto-checkable axes against a small fixture set (no LLM calls). Fast, deterministic.
- **Nightly (`.github/workflows/eval-nightly.yml`, new)**: runs the full suite on `dev`, posts report as a workflow artifact + Slack/email summary, updates `evals/reports/latest.json`. Compares to `evals/reports/baseline.json`. Fails the workflow if regression > threshold. Does NOT block deploys.
- Baseline updated by hand via `pnpm eval:baseline` after a verified-good run, committed to repo.

### 6. Cost guardrail

Each scenario carries a `max_cost_usd` field. The harness aborts a scenario if its run exceeds this and counts the scenario as failed. Default: $0.50 / run during Phase 3 dev, will revisit in Phase 4 alongside pricing.

## Alternatives Considered

- **Pure auto-checkable bar (no LLM judge).** Pros: cheap, deterministic. Cons: misses architecture coherence and brief fidelity, the two things customers care about most. Rejected.
- **Pure LLM-judge bar.** Pros: simple. Cons: judge drift over time; vulnerable to prompt-engineered runs that "look good" without being grounded. Rejected — keeping ≥50 % auto-checkable is the discipline anchor.
- **Higher bar (≥ 8.5 / 10).** Tempting, but with no historical data we'd block ourselves indefinitely. Start at 7.0/7.5; ratchet up in Phase 5 closed-beta when we have NPS data.
- **promptfoo as the harness.** Considered for prompt-level regression tests (will use it for **prompt-level** A/B in `packages/prompts/`), but not for full-pipeline scoring — promptfoo isn't built for multi-agent flows. Use a custom Python harness for full-pipeline scoring.

## Consequences

**Easier**:

- Phase 3 has a concrete "done" definition.
- Every prompt change is a measurable PR (auto-axes only) + nightly (full suite).
- Pricing decision in Phase 4 has data to anchor on (cost-per-run from harness).

**Harder**:

- Building 10–20 high-quality scenarios is real work; needs domain judgement.
- Judge calls cost money; nightly run estimated at ~$3–5 across full suite (15 scenarios × 2 judge calls × $0.10).
- Baseline drift management requires discipline (don't auto-baseline; require human review of new baselines).

**Follow-up**:

- Phase 3.4 ships harness + 3 seed scenarios (`evals/scenarios/001..003`).
- Phase 3 end-of-phase: expand to 10 scenarios; lock baseline.
- Phase 5 closed-beta: add real user briefs as scenarios (anonymized).
- Phase 6 launch: re-evaluate bar with NPS data; consider raising to 8.0 / 80 %.

## References

- [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §6 (Phase 3 DoD)
- [MVP.md](../../MVP.md) §5 (quality requirements)
- `.github/instructions/product-goals.instructions.md` (trust requirements)
- `.github/instructions/architecture.instructions.md` (LLM tier policy)
