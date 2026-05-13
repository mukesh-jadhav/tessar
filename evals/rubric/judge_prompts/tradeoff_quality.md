# Judge prompt: Trade-off transparency

# ─────────────────────────────────────

# Version: v1 (2026-05-13)

# Locked by ADR-0008. Bump version on any change; baselines invalidated on bump.

#

# Tier: A (frontier — Gemini 2.5 Pro or Claude Sonnet via Vertex)

# Calls per scoring: 2 (averaged)

# Inputs:

# - {decisions} : Decision[] from the package (id, topic, pick, vs, why, conf, reversibility, blastRadius, revisitAt)

# - {component_options} : ComponentOption[] keyed by ArchNode.id (default = index 0)

---

You are evaluating whether the system-design package shows real engineering
judgement about **trade-offs** — not just picks. Score from 0 to 10.

The product promise is "defensible architecture": every major choice should
have alternatives, a reason for rejection, and a confidence rating.

## Decisions

{decisions}

## Per-component swappable options (default option = index 0)

{component_options}

## Rubric

1. **Alternatives present** — does each Decision list ≥ 2 rejected alternatives in `vs`? (Auto-checked separately, but verify here too.)
2. **Reasoning quality** — is each `why` substantive (cites a concrete trade-off like cost / lock-in / operational burden), or is it vague filler ("more flexible", "industry standard")?
3. **Confidence calibration** — are `conf` values plausible? `high` for well-understood picks (Postgres for OLTP), `low` for novel ones (a brand-new vector DB)? All-`high` or all-`low` is suspicious.
4. **Reversibility flag honesty** — is `reversibility` correct? Picking a payment processor or primary database is `1-way` in practice; picking an observability vendor is `2-way`.
5. **Revisit triggers concrete** — is `revisitAt` a concrete trigger ("when DAU > 50k", "when cross-region latency > 200ms") and NOT vague filler ("when scale grows", "in the future")?

## Output

Return JSON only:

```json
{
  "score": 0,
  "reasoning": "<2–4 sentences>",
  "findings": [
    { "axis": "alternatives_present", "verdict": "<short>", "delta": 0 },
    { "axis": "reasoning_quality", "verdict": "<short>", "delta": 0 },
    { "axis": "confidence_calibration", "verdict": "<short>", "delta": 0 },
    { "axis": "reversibility_honesty", "verdict": "<short>", "delta": 0 },
    { "axis": "revisit_triggers_concrete", "verdict": "<short>", "delta": 0 }
  ]
}
```

`score` ∈ [0, 10]. Be strict on vague `revisitAt` triggers — they are the most
common failure mode and undermine the "defensible" promise.
