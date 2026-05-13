# kb-seed

Source of truth for TESSAR's knowledge base. PR-reviewed YAML records loaded
into Postgres at deploy.

See [.github/instructions/architecture.instructions.md](../.github/instructions/architecture.instructions.md) (KB section).

## Layout

```
kb-seed/
├── _schema.yaml            # JSON Schema (Draft 2020-12) — components/*.yaml must validate
├── components/             # one YAML per component (Cloud Run, Cloud SQL, Stripe, ...)
├── patterns/               # one YAML per architectural pattern (Phase 3.2+)
└── reference-archs/        # one YAML per anchor reference architecture (Phase 3.2+)
```

## Validation

Records are validated in CI by `evals/runners/validate_kb.py`. To run locally:

```powershell
cd evals
.\.venv\Scripts\python.exe -m runners.validate_kb
```

This:

1. Validates every `components/*.yaml` against [`_schema.yaml`](_schema.yaml).
2. Enforces id uniqueness across files.
3. Warns on records past their 90-day freshness SLA (`--strict-freshness` makes it fatal).
4. Emits a `name -> baseline_usd_per_month` cost map to
   `evals/reports/kb-cost-map.json`, consumed by the `cost_realism` rubric
   axis via `score_run --kb-costs`.

## Freshness SLA

Every record must be re-verified at least every 90 days. Bump
`last_verified_at` and refresh `sources[].snapshot_date` on each pass.

## Authoring a new component

1. Pick a stable `id` (`<vendor>.<short-name>`, lowercase, dotted).
2. Set `baseline_cost_usd_per_month` to a representative MVP-sized monthly
   floor; document the assumptions in `baseline_cost_assumptions`. Use `0`
   for pure pay-per-use services with no monthly floor at MVP volumes.
3. Cite ≥1 source (URL + ISO date).
4. Run `validate_kb` and `score_run --kb-costs` against a fixture before
   opening the PR.
