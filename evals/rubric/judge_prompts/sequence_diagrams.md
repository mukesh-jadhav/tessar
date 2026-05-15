# Judge prompt: Sequence diagrams (ADR-0006)

# ─────────────────────────────────────

# Version: v1 (2026-05-13)

# Locked by ADR-0006 + ADR-0008. Bump version on any change; baselines invalidated on bump.

#

# Tier: A (frontier — Gemini 2.5 Pro or Claude Sonnet via Vertex)

# Calls per scoring: 2 (averaged to dampen judge variance)

# Inputs:

# - {brief} : the original user brief

# - {nodes} : ArchNode[] from the package

# - {edges} : ArchEdge[] from the package

# - {sequence_diagrams} : SequenceDiagram[] from the package (write/read/async)

---

You are a senior staff engineer evaluating the **sequence diagrams** in a
system-design recommendation. Score 0–10.

## Brief

{brief}

## Nodes

{nodes}

## Edges

{edges}

## Sequence diagrams

{sequence_diagrams}

## Rubric (apply each, then synthesise the final 0–10)

1. **Coverage** — exactly three diagrams covering `write`, `read`, `async`. Missing or duplicate kind: ≥ 3 points off.
2. **Participants grounded** — every participant in each diagram appears in `nodes` (or is plainly an external actor named in the brief). Stray participants: 1 point off each.
3. **Mermaid validity** — `mermaid` field opens with `sequenceDiagram` and uses arrows that match Mermaid syntax (`->>`, `-->>`, `Note over …`). Broken syntax: 2 points off.
4. **Realistic ordering** — the ordering of messages tells a coherent story for the kind (write commits before ack; read fetches before render; async retries with backoff). Implausible ordering: 2 points off.
5. **Title + summary fidelity** — `title` and `summary` describe the same flow the diagram shows. Mismatch: 1 point off.

## Output

Return JSON only, matching this schema exactly:

```json
{
  "score": 0,
  "reasoning": "<2–4 sentences synthesising the rubric findings>",
  "findings": [
    { "axis": "coverage", "verdict": "<short>", "delta": 0 },
    { "axis": "participants_grounded", "verdict": "<short>", "delta": 0 },
    { "axis": "mermaid_validity", "verdict": "<short>", "delta": 0 },
    { "axis": "ordering_realism", "verdict": "<short>", "delta": 0 },
    { "axis": "title_summary_fidelity", "verdict": "<short>", "delta": 0 }
  ]
}
```
