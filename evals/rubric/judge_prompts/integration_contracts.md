# Judge prompt: Integration contracts (ADR-0006)

# ─────────────────────────────────────

# Version: v1 (2026-05-13)

# Locked by ADR-0006 + ADR-0008. Bump version on any change; baselines invalidated on bump.

#

# Tier: A (frontier — Gemini 2.5 Pro or Claude Sonnet via Vertex)

# Calls per scoring: 2

# Inputs:

# - {brief} : the original user brief

# - {edges} : ArchEdge[] from the package

# - {integration_contracts} : IntegrationContract[] from the package

# - {sources} : Source[] from the package

---

You are a senior staff engineer evaluating the **integration contracts** in a
system-design recommendation. Score 0–10.

## Brief

{brief}

## Edges

{edges}

## Integration contracts

{integration_contracts}

## Sources (numbered)

{sources}

## Rubric (apply each, then synthesise the final 0–10)

1. **Edge coverage** — every load-bearing or external-boundary edge has a contract. Critical edge missing a contract: 2 points off each.
2. **Mode + semantics fit** — `mode` (sync/async/stream) and `semantics` (at-least-once / exactly-once / best-effort) match the edge purpose. Webhook contracts must be `async` + `at-least-once`.
3. **Idempotency clarity** — `idempotency` names the dedup key or strategy concretely (e.g. "dedup by `eventId`"); vague answers like "handle duplicates" lose 1 point each.
4. **Retry policy realism** — `retry` specifies timeout + backoff + attempt cap (or DLQ) consistent with `mode`. Sync contracts with infinite retry: 2 points off.
5. **Citation grounding** — every contract's `cite` resolves to a real `Source.id`. Ungrounded contract: 1 point off each.

## Output

Return JSON only, matching this schema exactly:

```json
{
  "score": 0,
  "reasoning": "<2–4 sentences>",
  "findings": [
    { "axis": "edge_coverage", "verdict": "<short>", "delta": 0 },
    { "axis": "mode_semantics_fit", "verdict": "<short>", "delta": 0 },
    { "axis": "idempotency_clarity", "verdict": "<short>", "delta": 0 },
    { "axis": "retry_realism", "verdict": "<short>", "delta": 0 },
    { "axis": "citation_grounding", "verdict": "<short>", "delta": 0 }
  ]
}
```
