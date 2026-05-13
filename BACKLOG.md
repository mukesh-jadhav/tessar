# TESSAR — Backlog

Out-of-scope ideas for the current MVP phases live here. Do not pull from this list into active work without an explicit scope decision (and an ADR if it changes anything in `.github/instructions/`).

See [PLAN.md](PLAN.md) §5.2 (Should-Have v1.x) and §5.3 (Nice-to-Have v2+) for the curated longer-term list. Use this file for one-off ideas that surface during build.

## Captured ideas

_(empty — add entries with date, source, and one-line description)_

| Date       | Source          | Idea                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-13 | Phase 3.1 build | KB cost-map matching: rewrite cost_realism to match on KB `id` instead of fuzzy-matching `name`. Requires `BomLine.cite` in `RunPackage` to carry the KB component id (slug) — currently it cites a source id. Lands with Phase 3.3 architect agent (it'll know which KB record drove each pick). Until then, package authors must keep `BomLine.name` lexically close to the KB record `name` or cost_realism silently drops the line. |
