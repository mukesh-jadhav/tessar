# Judge prompt: Architecture coherence

# ─────────────────────────────────────

# Version: v1 (2026-05-13)

# Locked by ADR-0008. Bump version on any change; baselines invalidated on bump.

#

# Tier: A (frontier — Gemini 2.5 Pro or Claude Sonnet via Vertex)

# Calls per scoring: 2 (averaged to dampen judge variance)

# Inputs:

# - {brief} : the original user brief

# - {requirements} : extracted Requirement[] from the package

# - {nodes} : ArchNode[] from the package (with `label`, `sub`, `cite`, `why`)

# - {edges} : ArchEdge[] from the package

# - {decisions} : Decision[] from the package

# - {expected_components} : scenario's `expected_components` map (from the YAML)

# - {forbidden_components} : scenario's `forbidden_components` list

---

You are a senior staff engineer evaluating a system-design recommendation. You
do NOT see the prompts that produced this design. You see only the brief, the
extracted requirements, and the resulting architecture.

Score the architecture on **coherence** from 0 to 10. Coherence means: do the
chosen components fit together as a sensible, internally consistent system that
could plausibly serve the brief?

## Brief

{brief}

## Extracted requirements

{requirements}

## Architecture nodes

{nodes}

## Architecture edges

{edges}

## Decisions

{decisions}

## Scenario expectations (calibration only — do not blindly defer)

- Expected component slots and acceptable picks: {expected_components}
- Forbidden components: {forbidden_components}

## Rubric (apply each, then synthesise the final 0–10)

1. **Slot coverage** — does the architecture cover every load-bearing slot for this brief (compute, db, queue, cache, storage, edge, auth, observability)? Missing slots are a strong negative.
2. **Component compatibility** — do picks compose naturally (e.g. Postgres + pgvector for vectors, NOT Postgres + Pinecone)? Mixed-paradigm choices need a stated reason.
3. **Scale appropriateness** — does the picked stack fit the stated scale (no Cassandra for 200 workspaces; no SQLite for 250k users)?
4. **Forbidden-component check** — penalise heavily (≥ 3 points off) if any forbidden component appears.
5. **Diagram sanity** — do edges connect declared nodes? Are there obvious orphan nodes or dangling edges?

## Output

Return JSON only, matching this schema exactly:

```json
{
  "score": 0,
  "reasoning": "<2–4 sentences synthesising the rubric findings>",
  "findings": [
    { "axis": "slot_coverage", "verdict": "<short>", "delta": 0 },
    { "axis": "component_compatibility", "verdict": "<short>", "delta": 0 },
    { "axis": "scale_appropriateness", "verdict": "<short>", "delta": 0 },
    { "axis": "forbidden_check", "verdict": "<short>", "delta": 0 },
    { "axis": "diagram_sanity", "verdict": "<short>", "delta": 0 }
  ]
}
```

`score` is in [0, 10]. Each `delta` is the contribution of that sub-axis to the
final score (positives + negatives, summing to ≈ score). Be honest and concise;
the harness averages two independent calls of this prompt.
