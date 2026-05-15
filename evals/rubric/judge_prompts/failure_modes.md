# Judge prompt: Failure modes (ADR-0006)

# ─────────────────────────────────────

# Version: v1 (2026-05-13)

# Locked by ADR-0006 + ADR-0008. Bump version on any change; baselines invalidated on bump.

#

# Tier: A (frontier — Gemini 2.5 Pro or Claude Sonnet via Vertex)

# Calls per scoring: 2

# Inputs:

# - {brief} : the original user brief

# - {nodes} : ArchNode[] from the package (with `failure_domain`)

# - {failure_modes} : FailureMode[] from the package

# - {sources} : Source[] from the package

---

You are a senior staff engineer evaluating the **failure modes** table in a
system-design recommendation. Score 0–10.

## Brief

{brief}

## Nodes

{nodes}

## Failure modes

{failure_modes}

## Sources (numbered)

{sources}

## Rubric (apply each, then synthesise the final 0–10)

1. **Coverage of fragile nodes** — every node with a non-empty `failure_domain` has at least one failure_mode entry. Missing entry: 2 points off each.
2. **Mode plausibility** — `mode` describes a realistic failure for the chosen component (cold-start spike for serverless; index degradation for vector DB at scale). Implausible/generic ("server breaks"): 2 points off each.
3. **Detection concreteness** — `detection` names a signal you could actually alert on (metric + threshold, log pattern, or trace span). Vague: 1 point off each.
4. **Recovery actionability** — `recovery` is a runbook step an operator can execute, not "investigate the issue". Vague: 1 point off each.
5. **RTO / RPO realism** — `rto` and `rpo` are concrete durations (`< 5 min`, `0s`, `< 90s`) and consistent with the picked redundancy posture (HA → small RTO; single-zone → larger RTO ok). Inconsistent: 1 point off each.
6. **Citation grounding** — every entry's `cite` resolves to a real `Source.id`. Ungrounded: 1 point off each.

## Output

Return JSON only, matching this schema exactly:

```json
{
  "score": 0,
  "reasoning": "<2–4 sentences>",
  "findings": [
    { "axis": "coverage_of_fragile_nodes", "verdict": "<short>", "delta": 0 },
    { "axis": "mode_plausibility", "verdict": "<short>", "delta": 0 },
    { "axis": "detection_concreteness", "verdict": "<short>", "delta": 0 },
    { "axis": "recovery_actionability", "verdict": "<short>", "delta": 0 },
    { "axis": "rto_rpo_realism", "verdict": "<short>", "delta": 0 },
    { "axis": "citation_grounding", "verdict": "<short>", "delta": 0 }
  ]
}
```
