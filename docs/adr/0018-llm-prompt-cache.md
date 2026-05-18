# ADR-0018: Prompt cache for the LLM router

- **Status**: Accepted
- **Date**: 2026-05-17
- **Supersedes**: —
- **Superseded by**: —

## Context

`architecture.instructions.md` mandates:

> Aggressive prompt+retrieval caching in Redis (key: normalized input
> hash + KB snapshot id).

Without caching, every TESSAR run pays full LLM cost for every agent
even when re-running a brief that is structurally identical to a prior
one. Phase 4.2 is live with $0.155/run measured cost (vs $0.85 cap); we
have headroom but no defence against bursts of similar briefs from a
single user blowing through the cap. The cache is the locked design
mechanism that keeps cost-per-run trending DOWN as the same patterns
recur, instead of staying flat.

The router landed in Phase 3.2 without a cache layer. Phase-3 closure
work (alongside ADR-0017 hybrid retrieval) is when this gap closes.

## Decision

Add a `PromptCache` abstraction at the router level. The router
consults the cache before estimating provider cost and stores
successful completions after charging the budget.

**Cache key** = `sha256` over:

```
{
  "v": CACHE_VERSION,            # "v1" — bump to flush all entries
  "agent": agent_name,           # synthesizer | architect | ...
  "tier": tier.value,            # A | B | C
  "max_tokens": int,
  "temperature": round(float, 3),
  "kb_snapshot_id": str | "",    # "" when not bound
  "messages": [{role, content}]  # canonical, order-preserving
}
```

Two backends:

- `MemoryPromptCache` — process-local LRU (default `maxsize=512`). Used
  for tests + dev when `REDIS_URL` is unset.
- `RedisPromptCache` — sync `redis.Redis` over `REDIS_URL` (same client
  config as `tessar/redis_bus.py`, incl. `ssl_cert_reqs=None` for
  Memorystore `rediss://`). Failures are LOGGED + SWALLOWED — the cache
  is a cost optimization, never a correctness boundary.

**Bypass rule**: when `temperature > 0.3` the cache is bypassed
entirely (no lookup, no store). Creative agents asked for variety
shouldn't return the same answer twice.

**Cache-hit accounting**: a hit returns the cached `LlmResponse` with
`cache_hit=True` and `usage` zeroed. The original call already
charged the budget; replays are free.

**TTL**: 7 days default. KB snapshot id is in the key, so a KB refresh
naturally invalidates stale answers without manual flushing.

**Provider identity excluded from the key**: within a tier, providers
are fungible from the agent's perspective. A Claude→Gemini fallback
inside one run still benefits the next run that hits the same prompt.

## Wiring

`build_router()` now accepts `kb_snapshot_id` + `cache`. The runner
constructs the router before retrieval (when no snapshot is known),
then calls `router.set_kb_snapshot_id(...)` after retrieval picks
candidates. KB-aware Tier-A agents (synthesizer, architect,
cost_estimator, risk_writer) hit a snapshot-bound cache; upstream
agents (intake_normalizer, requirements_extractor, research_planner,
research_worker) cache with `kb_snapshot_id=""` — their outputs are
KB-agnostic.

## Consequences

**Positive**

- Repeat-shaped briefs cost a fraction of a fresh run — synthesizer +
  architect responses (the expensive ones) are the most likely to hit.
- Audit-tab data: every response carries `cache_hit`. Cost dashboards
  separate billed vs cached spend.
- KB versioning is automatic — no "flush cache after seed update"
  runbook step.
- Graceful degradation — Redis outage = transparent cache misses.

**Negative**

- Adds a `redis` dependency to the router import path (already a worker
  dep via `redis_bus.py`; lazy-imported in `build_prompt_cache`).
- Cache key includes `agent_name`, so renaming an agent invalidates its
  cache — acceptable, agent renames are rare and require ADRs.
- LRU eviction in `MemoryPromptCache` is unbounded by time. Dev usage
  pattern (short-lived processes) makes this acceptable.

**Risks**

- A stale cached response binds to a prompt version that may have
  changed. Mitigation: prompt files live in `packages/prompts/v*/` and
  the cache key includes the full message content, so any prompt edit
  changes the hash.
- Cross-tenant prompt collisions are possible at the wire layer
  (same content + same agent → same hash). At MVP this is by design:
  there is no PII in agent prompts (briefs are user-authored intent
  text, not personal data). When team workspaces ship (post-MVP), the
  cache key will need a `workspace_id` axis.

## Alternatives considered

- **Per-agent in-memory cache inside each agent module.** Worse
  reuse (no cross-agent learning), worse testability, no central
  metric.
- **Cache at the provider level (inside `VertexClaudeProvider` etc.).**
  Bad — caches the same prompt N times across providers, harder to
  audit, and a fallback chain produces inconsistent hits.
- **Disable cache below a certain prompt size.** Pointless — tiny
  prompts are also cheap to MISS-cache; the overhead is one Redis GET.
- **Cache the retrieval results separately.** Already implicit: the
  retrieval candidate list is part of the synthesizer prompt, so a
  changed candidate set changes the cache key. A separate retrieval
  cache is reasonable later if retrieval becomes a bottleneck.

## Validation

- 24 new unit tests in `tests/test_llm_cache.py` cover: key
  determinism, sensitivity to every keyed axis, temperature rounding,
  LRU semantics, Redis happy/fail paths, materialize_hit zeroing,
  router cache-hit path, bypass-above-ceiling, KB snapshot
  invalidation, backwards-compat for `LlmRouter(cache=None)`.
- Full orchestrator suite: 280/280 passing.
- Phase 4.2 production cost dashboard will show cache hit-rate within
  one nightly aggregation; expected steady-state hit-rate at 100
  runs/day is 40–60% for the upstream agents and 10–25% for Tier-A.

## Links

- `apps/orchestrator/tessar/llm/cache.py`
- `apps/orchestrator/tessar/llm/router.py` (cache lookup + store)
- `apps/orchestrator/tessar/llm/factory.py` (`build_router(kb_snapshot_id=, cache=)`)
- `apps/orchestrator/tessar/runner.py` (`router.set_kb_snapshot_id(...)` after retrieval)
- ADR-0015 — Claude Sonnet 4.5 Tier-A default (the call this cache most often saves)
- ADR-0017 — Hybrid KB retrieval (the source of `kb_snapshot_id`)
