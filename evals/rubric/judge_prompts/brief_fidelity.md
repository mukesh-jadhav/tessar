# Judge prompt: Brief fidelity

# ─────────────────────────────────────

# Version: v1 (2026-05-13)

# Locked by ADR-0008. Bump version on any change; baselines invalidated on bump.

#

# Tier: A (frontier — Gemini 2.5 Pro or Claude Sonnet via Vertex)

# Calls per scoring: 2 (averaged)

# Inputs:

# - {brief} : the original user brief

# - {scenario_must_have} : list of capabilities the package MUST address (from scenario YAML)

# - {scenario_must_not} : list of anti-requirements (from scenario YAML)

# - {requirements} : Requirement[] extracted by the orchestrator

# - {nodes} : ArchNode[] from the package

# - {decisions} : Decision[] from the package

# - {assumptions} : Assumption[] from the package

---

You are evaluating whether the system-design package actually solves what the
**user asked for**. Score from 0 to 10.

A beautiful design for the wrong problem is worthless. The package must:

- Address every must-have capability stated in the brief.
- Avoid recommending anti-patterns the brief explicitly excluded.
- Not invent requirements the brief never stated (no hallucinated SOC-2,
  multi-region, etc. unless the brief implies them).

## Brief

{brief}

## Must-have capabilities (from scenario)

{scenario_must_have}

## Anti-requirements (from scenario — penalise if recommended)

{scenario_must_not}

## What the orchestrator extracted as requirements

{requirements}

## What the architecture covers

- Nodes: {nodes}
- Decisions: {decisions}
- Assumptions: {assumptions}

## Rubric

1. **Must-have coverage** — for each must-have, is there a node OR decision OR assumption that addresses it? Missing must-haves are heavily penalised (≥ 2 points off per miss).
2. **Anti-pattern check** — does the package recommend anything in the must-not list? If so, ≥ 3 points off and call it out.
3. **No hallucinated requirements** — are all extracted `Requirement`s traceable to the brief, a clarification answer, or a documented `default`? Inventing scope (e.g. "must support 100k req/s" when the brief says "MVP for 200 users") is a strong negative.
4. **Constraint respect** — does the package respect stated budget / team-size / time-to-ship constraints? (e.g. monolith for 10-week MVP, managed services for 3-engineer team.)
5. **Assumption explicitness** — when the orchestrator filled gaps with defaults, did it surface them in `assumptions[]` so the user can override?

## Output

Return JSON only:

```json
{
  "score": 0,
  "reasoning": "<2–4 sentences>",
  "findings": [
    { "axis": "must_have_coverage", "verdict": "<short>", "delta": 0, "missing": [] },
    { "axis": "anti_pattern_check", "verdict": "<short>", "delta": 0, "violations": [] },
    { "axis": "no_hallucinated_reqs", "verdict": "<short>", "delta": 0 },
    { "axis": "constraint_respect", "verdict": "<short>", "delta": 0 },
    { "axis": "assumption_explicitness", "verdict": "<short>", "delta": 0 }
  ]
}
```

`score` ∈ [0, 10]. The `missing` and `violations` arrays must contain the
actual must-haves not addressed and the anti-patterns recommended (if any) —
the harness logs these for the run owner to triage.
