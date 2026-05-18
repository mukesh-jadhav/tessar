# TESSAR Eval Harness

End-to-end quality gate for the orchestrator pipeline. Scores complete
`RunPackage` outputs against pre-written scenarios and the rubric locked in
[ADR-0008](../docs/adr/0008-phase3-eval-bar.md).

## Layout

```
evals/
├── pyproject.toml               # standalone uv-managed package
├── scenarios/                   # YAML scenario specs (briefs + expectations)
│   ├── _schema.yaml             # JSON Schema for scenario files
│   ├── 001-b2b-saas-crm.yaml
│   ├── 002-fintech-realtime-feed.yaml
│   └── 003-marketplace-mvp.yaml
├── rubric/
│   ├── schema.py                # minimal Pydantic mirror of RunPackage
│   ├── checks.py                # auto-checkable axes: groundedness, schema, cost realism
│   ├── scoring.py               # weighted aggregation + bar evaluation
│   └── judge_prompts/           # versioned tier-A judge prompts (wired in Phase 3.2+)
│       ├── coherence.md
│       ├── tradeoff_quality.md
│       └── brief_fidelity.md
├── runners/
│   ├── score_run.py             # score one RunPackage JSON against one scenario
│   ├── score_suite.py           # score every (scenario, fixture) pair → JSON report
│   ├── check_baseline.py        # PR/nightly gate: report vs baseline (ADR-0008)
│   └── run_suite.py             # CLI: validate every scenario file
├── reports/
│   └── baseline.json            # locked-in baseline (committed; updated by hand)
└── README.md
```

## CI surface

- **Per-PR** (`.github/workflows/pr.yml::evals`): rubric unit tests +
  scenario validation + KB seed validation + `score_suite` + regression
  gate against the committed baseline. Drop > 0.5 points = merge blocked.
- **Nightly** (`.github/workflows/eval-nightly.yml`): scores the full
  suite, uploads the report as a workflow artifact, posts a job summary,
  fails the run (and optionally Slacks via `SLACK_EVAL_WEBHOOK`) on
  regression vs baseline.

## What works today (Phase 3.0)

- Auto-checkable axes (1, 2, 5 in the rubric) work end-to-end against any
  `RunPackage` JSON: groundedness, schema validity, cost realism.
- 3 seed scenarios committed; scenario JSON Schema documented.
- Scoring + bar evaluation logic working.
- **ADR-0006 structural axis** (`adr0006_completeness`) checks coverage of
  the 5 narrative artifacts (`sequenceDiagrams`, `integrationContracts`,
  `componentRationales`, `failureModes`, `buildSequence`). Reportable today;
  becomes a hard gate once judges are wired.
- **ADR-0006 judge prompts** (`judge_prompts/{sequence_diagrams,integration_contracts,component_rationales,failure_modes,build_sequence}.md`)
  ready for the LLM router.

## What lands in Phase 3.4

- Judge axes (3, 4, 6) wired through the LLM router (Phase 3.2 dependency).
- Nightly GitHub Actions workflow running the full suite against `dev`.
- PR gate (auto-axes only) wired into `pr.yml`.
- **ADR-0006 narrative judge wiring** — bar must absorb these before paid
  checkout flips on in prod.

## Run locally

```powershell
cd evals
uv sync
uv run python -m runners.score_run --scenario scenarios/001-b2b-saas-crm.yaml --package path/to/run.json
```

Until Phase 3.3 ships a real run, you can hand-craft a fixture matching
[packages/shared-schemas/index.ts](../packages/shared-schemas/index.ts) `RunPackage`.

## Why not promptfoo

`promptfoo` is for **single-call** prompt A/B. TESSAR is **multi-agent** with
RAG, web fetches, and validation loops. We use `promptfoo` for prompt-level
regression inside `packages/prompts/` (Phase 3.2) and this harness for
end-to-end pipeline scoring.

## References

- [ADR-0008](../docs/adr/0008-phase3-eval-bar.md) — eval bar + harness design
- [packages/shared-schemas/index.ts](../packages/shared-schemas/index.ts) — `RunPackage` contract
- [IMPLEMENTATION.md](../IMPLEMENTATION.md) §6 — Phase 3 DoD
