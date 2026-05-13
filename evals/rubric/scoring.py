"""
Weighted aggregation + bar evaluation for TESSAR eval runs.

Locked numbers from ADR-0008:
- per-scenario pass: weighted score >= 7.0 AND no individual axis < 4
- suite pass: >=80% of scenarios pass AND aggregate weighted >= 7.5
- regression gate: PR fails if aggregate drops by > 0.5 vs baseline

If you change these numbers, update ADR-0008 and bump this module's
constants in the same PR.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from .checks import AxisScore

# ─── Locked weights (sum to 1.0) ─────────────────────────────────

AXIS_WEIGHTS: dict[str, float] = {
    "groundedness": 0.25,
    "schema_validity": 0.15,
    "coherence": 0.20,
    "tradeoff_quality": 0.15,
    "cost_realism": 0.10,
    "brief_fidelity": 0.15,
}
assert abs(sum(AXIS_WEIGHTS.values()) - 1.0) < 1e-9, "weights must sum to 1.0"

# ─── Locked bar ──────────────────────────────────────────────────

PER_SCENARIO_PASS_THRESHOLD = 7.0
PER_AXIS_FLOOR = 4.0
SUITE_PASS_RATE_THRESHOLD = 0.80
SUITE_AGGREGATE_THRESHOLD = 7.5
REGRESSION_TOLERANCE = 0.5


# ─── Aggregation ─────────────────────────────────────────────────


@dataclass
class ScenarioResult:
    scenario_id: str
    axes: dict[str, AxisScore]
    weighted_score: float
    passed: bool
    failure_reasons: list[str] = field(default_factory=list)


@dataclass
class SuiteResult:
    scenarios: list[ScenarioResult]
    pass_rate: float
    aggregate_score: float
    suite_passed: bool
    failure_reasons: list[str] = field(default_factory=list)


def score_scenario(scenario_id: str, axes: Iterable[AxisScore]) -> ScenarioResult:
    """Aggregate one scenario's axes into a per-scenario pass/fail."""
    by_name = {a.axis: a for a in axes}

    # Validate that every weighted axis has a score (judged ones may be
    # missing during Phase 3.0 — treat as 'not yet scored' = neutral 7.0
    # so the harness is usable before the LLM router exists).
    weighted_total = 0.0
    failures: list[str] = []
    for axis_name, weight in AXIS_WEIGHTS.items():
        a = by_name.get(axis_name)
        if a is None:
            # neutral fill while judges are not yet wired
            weighted_total += 7.0 * weight
            continue
        weighted_total += a.score * weight
        if a.score < PER_AXIS_FLOOR:
            failures.append(
                f"axis `{axis_name}` scored {a.score:.1f} (< floor {PER_AXIS_FLOOR})."
            )

    passed = weighted_total >= PER_SCENARIO_PASS_THRESHOLD and not failures
    if weighted_total < PER_SCENARIO_PASS_THRESHOLD:
        failures.insert(
            0,
            f"weighted score {weighted_total:.2f} < per-scenario bar {PER_SCENARIO_PASS_THRESHOLD}.",
        )

    return ScenarioResult(
        scenario_id=scenario_id,
        axes=by_name,
        weighted_score=weighted_total,
        passed=passed,
        failure_reasons=failures,
    )


def score_suite(results: list[ScenarioResult]) -> SuiteResult:
    """Aggregate scenario results into the suite pass/fail."""
    if not results:
        return SuiteResult(
            scenarios=[],
            pass_rate=0.0,
            aggregate_score=0.0,
            suite_passed=False,
            failure_reasons=["empty suite — nothing to score."],
        )
    passed = sum(1 for r in results if r.passed)
    rate = passed / len(results)
    aggregate = sum(r.weighted_score for r in results) / len(results)

    failures: list[str] = []
    if rate < SUITE_PASS_RATE_THRESHOLD:
        failures.append(
            f"pass rate {rate:.0%} < suite bar {SUITE_PASS_RATE_THRESHOLD:.0%} "
            f"({passed}/{len(results)} scenarios passed)."
        )
    if aggregate < SUITE_AGGREGATE_THRESHOLD:
        failures.append(
            f"aggregate {aggregate:.2f} < suite bar {SUITE_AGGREGATE_THRESHOLD}."
        )

    return SuiteResult(
        scenarios=results,
        pass_rate=rate,
        aggregate_score=aggregate,
        suite_passed=not failures,
        failure_reasons=failures,
    )


def is_regression(current_aggregate: float, baseline_aggregate: float) -> bool:
    """True if `current` has dropped by more than the locked tolerance vs `baseline`."""
    return baseline_aggregate - current_aggregate > REGRESSION_TOLERANCE
