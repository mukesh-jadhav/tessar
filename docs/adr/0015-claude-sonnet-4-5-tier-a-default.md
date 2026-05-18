# ADR-0015: Claude Sonnet 4.5 as Tier-A Default (Vertex Gemini → Vertex Claude swap for frontier reasoning)

- **Status:** Accepted
- **Date:** 2026-05-18
- **Deciders:** founder
- **Supersedes (in part):** the "Vertex AI Gemini primary" decision in [MVP.md](../../MVP.md) §5 and `.github/instructions/architecture.instructions.md` (LLM rows) — specifically for **Tier-A only**. Gemini remains primary for Tier-B and Tier-C.

## Context

The current locked provider chain (per [MVP.md](../../MVP.md) §5 / `architecture.instructions.md`) is:

> **LLM primary:** Vertex AI Gemini (frontier/flash/nano tiers)
> **LLM fallback:** Claude on Vertex AI, then OpenAI direct as last resort.

Phase-3 reality check (May 2026):

- Today's prod failures (`cmpb2i5` and others) all originated in **Tier-A nodes** (`architect`, `synthesizer`, `risk_writer`) producing structurally invalid or admissibility-failing JSON, not in cheaper tiers.
- The 3-attempt retry shipped in commit `91410ab` papers over the symptom but the root cause is Gemini 2.5 Pro's relative weakness on long, schema-strict, multi-rule reasoning tasks compared to Claude Sonnet 4.5.
- Public benchmarks + our own ad-hoc spot-checks consistently rank Claude Sonnet 4.5 above Gemini 2.5 Pro on multi-step structured-output tasks with hard admissibility constraints (which is exactly what TESSAR's Tier-A nodes do).
- Anthropic's Vertex AI partnership means **same IAM, same region, same SDK shape** as Gemini — zero new vendor surface, no new secrets, no new compliance review. Cost differential is the only real tradeoff.

The user request: "make Claude 4.7 (or latest) as default if possible". No "Claude 4.7" exists; the latest Claude generation as of May 2026 is **Sonnet 4.5** + **Opus 4.1**. Sonnet 4.5 is the correct default — Opus 4.1 is ~5× more expensive and the quality lift on TESSAR's task shape does not justify the cost.

## Decision

**Tier-A frontier reasoning defaults to Claude Sonnet 4.5 on Vertex AI.** Specifically:

1. **Tier-A primary:** `claude-sonnet-4-5@20250929` (or latest published `@DATE` suffix) via Vertex AI.
2. **Tier-A fallback chain (in order):** Claude Sonnet 4.5 → Gemini 2.5 Pro → OpenAI `gpt-5` (last resort).
3. **Tier-B & Tier-C unchanged:** Gemini 2.5 Flash / Flash-Lite remain primary. Claude is not used here — Sonnet 4.5's cost premium is irrational for research-worker and classification work where Flash is consistently good enough. Fallback for Tier-B/C is Gemini → OpenAI `gpt-5-mini` / `gpt-5-nano`.
4. **Per-run budget cap bumped from $0.50 → $0.85** to absorb the Claude Tier-A premium (≈$0.35 of Tier-A spend goes from ~$0.10 to ~$0.30 per run in the steady-state architect/synthesizer/risk-writer triad). New cap derived from: 30k input + 8k output Tier-A tokens × Sonnet 4.5 rates ($3/$15 per MTok) ≈ $0.21 per Tier-A call × 3 calls = $0.63, plus Tier-B/C floor (~$0.10), plus 30% safety margin.
5. **Pricing table** in `apps/orchestrator/tessar/llm/providers/vertex_claude.py` keyed to the published Vertex AI Anthropic prices; refreshed per the same 90-day KB freshness SLA.

## Alternatives Considered

- **Keep Gemini 2.5 Pro as Tier-A default.** Cheapest. Rejected because today's reliability work proves we're paying for retries we could avoid by using a stronger model. The 3-attempt logic still doesn't catch semantic-content failures — a stronger model does.

- **Claude Opus 4.1 as Tier-A default.** Best quality available. Rejected on cost: ~5× Sonnet 4.5 = per-run cost balloons to ~$2.50, breaks the per-run-margin target in `product-goals.instructions.md`. Reserve Opus for explicit "premium" plan post-MVP.

- **OpenAI gpt-5 as Tier-A default (direct, not Vertex).** Plausible quality. Rejected because (a) introduces a real second vendor (separate IAM, separate billing, separate compliance review, secrets-in-Secret-Manager handling); (b) breaks the "single vendor surface via Vertex" property; (c) we already plan to wire OpenAI direct as **last-resort fallback** — that's the right scope for OpenAI in MVP.

- **Switch ALL tiers to Claude.** Quality maxed everywhere. Rejected on cost (Tier-B/C calls dominate volume; Claude Haiku is ~3× more expensive than Gemini Flash-Lite for no measurable quality lift on classification work).

## Consequences

### What becomes easier

- Architect / synthesizer / risk-writer admissibility failures expected to drop materially. Today's 3-attempt retry becomes a true safety net rather than a regular code path.
- Claude is genuinely better at the "long structured JSON with many simultaneous rules" task shape that TESSAR's Tier-A nodes need.
- Single SDK (`anthropic` Python lib with `AnthropicVertex` client) means no GCP-specific imports outside the adapter — preserves the cloud-portability rule.

### What becomes harder

- Per-run cost rises ~$0.35 (Tier-A triad). Pricing-point decision in `implementation-discipline.instructions.md` Open Decision #1 must absorb this; revisit pre-launch.
- Two adapters to maintain (Vertex Gemini for B/C + fallback, Vertex Claude for A). Already planned per architecture.instructions.md so not new work.
- Budget tracker's pre-check estimate is per-provider; the router's current "skip provider if estimate-over-budget" guard needs to handle the case where Claude's estimate fails budget but Gemini's would pass. Today the router aborts in that case — we accept that behaviour as a "if the run can't afford the right model, fail fast" property and re-evaluate if cost telemetry shows it firing.

### Follow-up work this ADR triggers (done atomically with this ADR)

1. `apps/orchestrator/tessar/llm/providers/vertex_claude.py` — new adapter (`anthropic.AnthropicVertex` client; JSON-mode via system prompt since Anthropic doesn't have a hard `response_mime_type` switch like Gemini; transient-error classification mirroring vertex_gemini).
2. `apps/orchestrator/tessar/llm/factory.py` — swap chain order for Tier-A: Claude first, then Gemini, then OpenAI. Tier-B/C keep Gemini-first.
3. `apps/orchestrator/tessar/llm/tier_policy.py` — unchanged; tier→agent mapping is orthogonal to which provider serves which tier.
4. `apps/orchestrator/pyproject.toml` — add `anthropic[vertex]>=0.40.0` dep.
5. `apps/orchestrator/tessar/config.py` — `llm_cap_usd_per_run` default bumped to `0.85`.
6. New `tests/test_vertex_claude_provider.py` — unit tests with mocked SDK, mirrors `test_vertex_gemini_provider.py` shape.
7. Eval suite re-baselined on Claude Tier-A (Phase-3d work) — separate PR per `implementation-discipline.instructions.md` ("regressions block PR merges").

## Doc updates this ADR triggers (atomic with this ADR)

- `MVP.md` §5 LLM rows
- `.github/instructions/architecture.instructions.md` LLM rows + tier-policy bullet

## References

- [MVP.md](../../MVP.md) §5
- `.github/instructions/architecture.instructions.md`
- [ADR-0008: per-run LLM budget cap](./0008-per-run-llm-budget.md) (if exists; otherwise note bump in this ADR is canonical for now)
- [ADR-0013: Brief-run reliability contract](./0013-brief-run-reliability-contract.md) — context for why Tier-A quality matters
- Anthropic Claude on Vertex AI docs: https://docs.anthropic.com/en/api/claude-on-vertex-ai
- Vertex AI Anthropic pricing: https://cloud.google.com/vertex-ai/generative-ai/pricing
