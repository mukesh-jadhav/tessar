# kb-seed

Source of truth for TESSAR's knowledge base. PR-reviewed YAML records loaded
into Postgres at deploy.

See [.github/instructions/architecture.instructions.md](../.github/instructions/architecture.instructions.md) (KB section) and [ADR-0016](../docs/adr/0016-kb-scope-bounded-comprehensive.md) (scope + buckets + cadence).

## Layout

```
kb-seed/
├── _schema.yaml            # JSON Schema (Draft 2020-12) — components/*.yaml must validate
├── components/             # one YAML per component (Cloud Run, Cloud SQL, Stripe, ...)
├── patterns/               # one YAML per architectural pattern (Phase 3.2+)
└── reference-archs/        # one YAML per anchor reference architecture (Phase 3.2+)
```

## Scope (per ADR-0016)

Target ~300 records total, distributed:

| Bucket                                                 | Target |
| ------------------------------------------------------ | ------ |
| GCP components (full BOM + cost)                       | ~105   |
| AWS equivalents (component list, no cost)              | ~50    |
| Azure equivalents (component list, no cost)            | ~50    |
| Third-party SaaS (auth, payments, observability, etc.) | ~65    |
| Patterns                                               | 30     |
| Reference architectures                                | 15     |

Out of scope (do NOT add): embedded/IoT, gaming, HPC, on-prem hardware, crypto/web3, telco, ERP. See ADR-0016 for the full out-of-scope list.

## Curation cadence

- One bucket per PR (max 30 records). Reviewer signs off on: schema compliance, sources reachable, capability summary correct, pricing-model class correct, regions list correct, compliance flags correct.
- AI-assisted drafting allowed; PR review mandatory. Tag LLM-drafted records `provenance: "llm-assisted"` so the freshness job can prioritise re-verification.
- Sustained pace: 2–4 buckets / week → target reached in 8–12 weeks part-time.

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
