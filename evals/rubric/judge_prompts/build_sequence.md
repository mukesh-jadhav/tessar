# Judge prompt: Build sequence (ADR-0006)

# ─────────────────────────────────────

# Version: v1 (2026-05-13)

# Locked by ADR-0006 + ADR-0008. Bump version on any change; baselines invalidated on bump.

#

# Tier: A (frontier — Gemini 2.5 Pro or Claude Sonnet via Vertex)

# Calls per scoring: 2

# Inputs:

# - {brief} : the original user brief

# - {nodes} : ArchNode[] from the package

# - {build_sequence} : BuildPhase[] from the package (list order = build order)

---

You are a senior staff engineer evaluating the **phased build sequence** in a
system-design recommendation. Score 0–10.

## Brief

{brief}

## Nodes

{nodes}

## Build sequence (list order is the build order)

{build_sequence}

## Rubric (apply each, then synthesise the final 0–10)

1. **Phase count** — between 3 and 6 phases inclusive. Out of band: 2 points off.
2. **Node coverage** — every node in `nodes[]` is built in at most one phase, and every node appears in some phase by the end. Orphan nodes: 1 point off each. Double-built nodes: 1 point off each.
3. **Dependency order** — earlier phases do not depend on nodes that only appear later (e.g. don't build "Stripe webhook reconciler" before the DB exists). Inversions: 2 points off each.
4. **Demoability** — each phase ends in something a user or operator can see/test (capture form works; history shows; payment flows). Phase with no observable outcome: 1 point off each.
5. **Rationale specificity** — each phase's `rationale` explains _why this is the next step now_, not generic copy. Generic: 1 point off each.

## Output

Return JSON only, matching this schema exactly:

```json
{
  "score": 0,
  "reasoning": "<2–4 sentences>",
  "findings": [
    { "axis": "phase_count", "verdict": "<short>", "delta": 0 },
    { "axis": "node_coverage", "verdict": "<short>", "delta": 0 },
    { "axis": "dependency_order", "verdict": "<short>", "delta": 0 },
    { "axis": "demoability", "verdict": "<short>", "delta": 0 },
    { "axis": "rationale_specificity", "verdict": "<short>", "delta": 0 }
  ]
}
```
