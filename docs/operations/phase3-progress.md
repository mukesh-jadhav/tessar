# Phase 3 — progress & follow-ups

Source-of-truth tracker for the Phase 3 ("real intelligence") slices.
Updated as each slice lands. See [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §6 for the gate.

> **Working agreement:** each slice ships with the same 5-step recipe
> (Pydantic schema mirror in `apps/orchestrator/tessar/schemas/` →
> versioned prompt in `packages/prompts/<agent>/v1.md` → agent module
> with one validation-retry under `tessar/agents/` →
> MockLlmProvider-driven unit tests → runner integration replacing the
> matching beats from `tessar/canned_timeline.py`). Failures inside a
> single agent become structured errors; only `BudgetExceeded` aborts a
> run mid-flight.

## Slice status

| #    | Slice                       | Tier    | Status  | Tests | Notes                                                                                                                                                                                                                                                                                                                                                    |
| ---- | --------------------------- | ------- | ------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.0  | Eval harness + ADR-0008     | —       | ✅ done | 10    | `evals/` standalone uv project; 0.50 USD / 400k tokens per-run cap                                                                                                                                                                                                                                                                                       |
| 3.1  | KB schema + 10 seed records | —       | ✅ done | —     | `kb-seed/` + validator; cost-map matching gap noted in BACKLOG                                                                                                                                                                                                                                                                                           |
| 3.2  | LLM router + budget tracker | —       | ✅ done | 14    | `tessar/llm/`; mock + Vertex Gemini stub; transient-only fallback                                                                                                                                                                                                                                                                                        |
| 3.3  | `intake_normalizer`         | C       | ✅ done | 10    | first real agent; t=80–240                                                                                                                                                                                                                                                                                                                               |
| 3.4  | `requirements_extractor`    | B       | ✅ done | 11    | t=270–1100; ≤3 clarify questions surfaced via `open_questions` (no synchronous pause — preserves autonomous SLA)                                                                                                                                                                                                                                         |
| 3.5  | `research_planner`          | B       | ✅ done | 11    | t=1120–1380; ≤8 RQs ordered priority-descending; must cover every brief.compliance entry                                                                                                                                                                                                                                                                 |
| 3.6  | `research_worker` × N       | B (∥)   | ✅ done | 14    | t=1400–3300; mock search only (Tavily/Brave/Trafilatura/Playwright are ADR-gated); per-question failures land in `errors[]`, run continues                                                                                                                                                                                                               |
| 3.7  | `synthesizer`               | A       | ✅ done | 18    | t=3320–4300; first frontier-tier agent; KB loader + admissibility check (every pick cites a supplied KB id OR a returned finding RQ-NN)                                                                                                                                                                                                                  |
| 3.8  | `architect`                 | A       | ✅ done | 20    | t=4320–4840; ArchNode/ArchEdge/FlowStep + 3 Mermaid diagrams (C4 / data-flow / sequence); admissibility extends synthesizer's grounding rule with topology integrity (no dangling edges/flows, no self-loops)                                                                                                                                            |
| 3.9  | `cost_estimator`            | B       | ✅ done | 19    | t=4860–5280; BomLine[] + 1×/10×/100× monthly rollups; admissibility extends grounding with KB-cost-band check (KB-cited lines must price within 0.25×–4× of supplied baseline) and rollup monotonicity                                                                                                                                                   |
| 3.10 | `risk_and_tradeoff_writer`  | A       | ✅ done | 21    | t=5300–5800; module is `risk_writer.py` (matches canned phase id); emits `Risks` (4–12 items, 8 categories); admissibility = citation grounding + component_id grounding (Decision.component_id OR ArchNode.id)                                                                                                                                          |
| 3.11 | `packager`                  | — (det) | ✅ done | 29    | t=5820–6420; deterministic (no LLM); promotes `RunPackage` mirror to `tessar/schemas/run_package.py` (camelCase TS-shape with Pydantic alias-on-dump); numbers all citations 1-based into `sources[]` and remaps `DecisionCitation` -> int on Decision/ArchNode/BomLine/Risk; serializes to long-form markdown; runner uploads MD + JSON + PDF artifacts |

Total orchestrator tests as of 3.6: **61/61 passing**.
Total orchestrator tests as of 3.7: **79/79 passing**.
Total orchestrator tests as of 3.8: **99/99 passing**.
Total orchestrator tests as of 3.9: **118/118 passing**.
Total orchestrator tests as of 3.10: **139/139 passing**.
Total orchestrator tests as of 3.11: **168/168 passing**. Phase 3 agent graph is end-to-end real (intake → packager).

## Deferred work (must clear before Phase 3 closes)

- **Tavily + Brave search adapters** — `tessar/search/providers/{tavily,brave}.py`. Requires ADR (new framework-level deps: `tavily-python`, `httpx` for Brave REST). Until landed, every research run lands all RQs in `errors[]` with reason `"no search hits"`.
- **Trafilatura + Playwright scrape adapter** — `tessar/search/scrape.py`. Same ADR. Tavily's `raw_content` covers ~70%; the rest needs a JS-rendered scrape fallback.
- **Vertex Claude provider + OpenAI direct provider** — second + third entries in the `LlmRouter` chain. `tessar/llm/factory.py` has TODO markers for both. Required before launch (architecture rule: Gemini → Claude-on-Vertex → OpenAI direct).
- **Add `google-cloud-aiplatform` + `vertexai`** to `apps/orchestrator/pyproject.toml` once the first real Vertex call ships (currently lazy-imported, not in deps).
- **Promote `RunPackage` mirror** from `evals/rubric/schema.py` (partial) into `apps/orchestrator/tessar/schemas/run_package.py` (full). Lands with Phase 3.7 synthesizer or Phase 3.11 packager — synthesizer is the first agent that emits package-shaped output. _(2026-05-14: closed by Phase 3.11 — the full TS-shape mirror now lives at `tessar/schemas/run_package.py`. The partial subset at `evals/rubric/schema.py` stays as the eval-rubric-friendly relaxed view.)_
- **Wire `evals/runners/run_suite.py`** to actually fire the orchestrator end-to-end. Currently only validates scenarios.
- **KB cost-map matching gap** — see BACKLOG.md row dated 2026-05-13. Fix when the architect/synthesizer makes decisions cite the KB component `id` directly. _(2026-05-14: partially closed by cost_estimator's KB-band admissibility check; remaining gap is fuzzy-matching when an LLM picks a component the KB doesn't cover — currently those land as `kind=finding` cites if a research finding backs the price.)_
- **LLM-judge for evals** — Phase 3.0 left axes 3, 6, 7 (clarity, depth-of-research, decision-traceability) auto-filling 7.0. Wire a real Tier-A judge call before flipping the eval bar gate ON in Phase 4.

## Recipe template (next slice)

For each new agent N:

1. **Schema** — `apps/orchestrator/tessar/schemas/<name>.py` (Pydantic, `ConfigDict(extra="forbid")`). Add to `schemas/__init__.py`.
2. **Prompt** — `packages/prompts/<agent>/v1.md` with `## System` / `## User` sections and explicit placeholders. Document tier + ownership in the front-matter blockquote.
3. **Agent** — `apps/orchestrator/tessar/agents/<agent>.py` exposing one async-friendly entry point. ONE retry on validation/JSON failure. Two failures raise `<Agent>Error` (which the runner catches and maps to a `phase=failed` event), unless this agent is allowed to fail per-item like `research_worker` (then return a structured error row).
4. **Tests** — `apps/orchestrator/tests/test_<agent>.py`. Cover: happy path, fence stripping, tier check, retry on bad JSON, retry on validation error, two-failure error, transient router fallback, budget propagation, prompt template plumbing, at least two schema-bound checks.
5. **Runner integration** — call from `runner.py` at the next free `t=` window (see `tessar/canned_timeline.py` for the canonical beats); emit `started` / `metric` / `completed` with real `router.budget.state()` numbers; widen `REPLACED_PHASES` and the `t<=` filter threshold.
6. **Memory** — append a one-line entry to `/memories/repo/tessar.md` capturing the public surface + key decisions. Avoid raw `$` in regex strings (str_replace has historically corrupted the file when content contains `$` — prefer `insert` and write `\d{1,3}` not `\d{1,3}` followed by `$`).
7. **Update this doc** — flip the slice row to ✅ and add any new follow-ups to "Deferred work".

## Pre-Phase-4 gates

- Eval bar agreed and clearing in CI
- Tavily + Vertex providers live in dev (`vertex_project` set)
- 7-day rolling cost-per-run within ADR-0008 cap
- Restore-drill rehearsed once (see [restore-drill.md](restore-drill.md))
