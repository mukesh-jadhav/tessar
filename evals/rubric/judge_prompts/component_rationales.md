# Judge prompt: Component rationales (ADR-0006)

# ─────────────────────────────────────

# Version: v1 (2026-05-13)

# Locked by ADR-0006 + ADR-0008. Bump version on any change; baselines invalidated on bump.

#

# Tier: A (frontier — Gemini 2.5 Pro or Claude Sonnet via Vertex)

# Calls per scoring: 2

# Inputs:

# - {brief} : the original user brief

# - {requirements} : Requirement[] from the package

# - {nodes} : ArchNode[] from the package

# - {component_rationales} : ComponentRationale[] from the package

# - {sources} : Source[] from the package

---

You are a senior staff engineer evaluating the **per-component "fits because"
rationales** in a system-design recommendation. Score 0–10.

## Brief

{brief}

## Requirements

{requirements}

## Nodes

{nodes}

## Component rationales

{component_rationales}

## Sources (numbered)

{sources}

## Rubric (apply each, then synthesise the final 0–10)

1. **Critical-pick coverage** — every load-bearing node (compute, db, queue, auth, payment) has at least one rationale. Missing one: 2 points off each.
2. **Requirement linkage** — `requirement_id` actually appears in `requirements[]` AND the `narrative` references that requirement substantively (not just by id). Empty linkage: 1 point off each.
3. **Specific reasoning** — `narrative` explains _why this component fits this brief_, not generic marketing copy ("scales horizontally" alone is a fail). Generic narrative: 1 point off each.
4. **Citation grounding** — every rationale's `cite` resolves to a real `Source.id`. Ungrounded rationale: 1 point off each.
5. **No contradictions** — the narrative does not contradict the picked node's other fields (e.g. claiming "stateless" for a database). Contradiction: 2 points off each.

## Output

Return JSON only, matching this schema exactly:

```json
{
  "score": 0,
  "reasoning": "<2–4 sentences>",
  "findings": [
    { "axis": "critical_pick_coverage", "verdict": "<short>", "delta": 0 },
    { "axis": "requirement_linkage", "verdict": "<short>", "delta": 0 },
    { "axis": "specific_reasoning", "verdict": "<short>", "delta": 0 },
    { "axis": "citation_grounding", "verdict": "<short>", "delta": 0 },
    { "axis": "no_contradictions", "verdict": "<short>", "delta": 0 }
  ]
}
```
