---
applyTo: "**"
---
# TESSAR — Implementation Discipline (do not drift)

Source of truth: [IMPLEMENTATION.md](../../IMPLEMENTATION.md).

## Build philosophy (locked)
1. **UI-first.** Build clickable, designed screens with mocked data before wiring intelligence.
2. **One vertical slice at a time.** Each phase ends with something demoable end-to-end at that phase's depth.
3. **Mock until proven.** Every backend dependency starts as a typed mock; replaced only when consuming UI is settled.
4. **Eval before launch.** No paid checkout in prod until the eval harness clears the agreed bar.
5. **Cloud-portable shape.** No GCP-specific imports outside thin adapter layers.
6. **DoD gates are hard.** Phase N+1 does not start until Phase N's Definition of Done is met.

## Phases (in order)
| # | Theme | DoD summary |
|---|---|---|
| 0 | Foundations | Repo + design tokens + Storybook with 8 themed M3 components, light + dark, CI green |
| 1 | **UI prototype** | All screens production-quality with mock data + replayed live progress + **5+ user feedback sessions** completed |
| 2 | Backend skeleton | Real DB + auth + canned package flowing end-to-end through real Pub/Sub + Cloud Storage |
| 3 | Real intelligence | KB seeded + LLM router + 9 agents + eval harness baselined; real packages produced |
| 4 | Monetize & harden | Stripe live-flow + observability + Cloud Armor + runbooks + restore drill + prod env |
| 5 | Closed beta | 10 invited users; NPS + cost-margin tracked; KB grown via real use |
| 6 | Public launch | Stripe live + status page + soft-launch checklist |

Full DoD per phase in [IMPLEMENTATION.md](../../IMPLEMENTATION.md) §3–§9.

## Hard rules
- **Do not skip Phase 1's user-feedback gate.** Show the prototype to ≥5 target users and document feedback before Phase 2.
- **Do not** introduce real LLM calls before Phase 3.
- **Do not** flip Stripe to live mode before Phase 6.
- **Do not** add features outside the 14 MVP must-haves (`product-goals.instructions.md`) inside MVP phases. New ideas → `BACKLOG.md`.
- **Do not** weaken eval/quality gates to ship faster.

## Continuous workstreams (run from Phase 0 onward)
- **KB curation** — weekly review; freshness SLA 90 days per record.
- **Eval bar** — score must trend up or stay flat; regressions block PR merges.
- **Prompt versioning** — every prompt change is a PR with eval delta.
- **Cost-per-run tracking** — dashboard reviewed weekly.
- **User feedback loop** — every dissatisfied run gets a manual review.

## Code change discipline
- New backend dependency at the framework/cloud-service level → requires an ADR in `docs/adr/`.
- New agent → update agent graph in [MVP.md](../../MVP.md) §3.4 + write a Pydantic schema for its output + add to eval harness.
- New API route → add Zod validation (web) or Pydantic (worker); add to `packages/shared-schemas`.
- New prompt → version it in `packages/prompts/`; add a promptfoo test.
- New UI component → add a Storybook story; respect design language rules.

## Pre-Phase-0 gates (must be answered before scaffolding)
1. Pricing point (Phase 4 needs this; Phase 1 user research informs it)
2. GCP region (Phase 2 needs this)
3. Google for Startups Cloud Program application (submit before Phase 2)
4. Eval bar (must be agreed before Phase 3 ends)
5. Brand seed color (needed at Phase 0 start to generate M3 tokens)

## When in doubt
- Re-read the relevant skill file (`product-goals`, `architecture`, `design-language`, this one).
- If still unclear, write an ADR proposing the change and ask before implementing.
- Don't silently drift. Drift is the failure mode.
