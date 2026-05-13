"""cost_estimator — sixth real node of the agent graph (Phase 3.9).

Tier-B. Strict JSON output validated against `CostEstimate`. Same
single-retry-on-failure pattern as the other agents, with three
admissibility checks beyond Pydantic:

1. **Citation grounding** — every `BomLine.cite` must reference a
   supplied KB id or a returned `RQ-NN` finding (mirrors the
   synthesizer / architect rule).
2. **Roll-up sanity** — `monthly_at_10x_usd >= monthly_baseline_usd`
   and `monthly_at_100x_usd >= monthly_at_10x_usd`. The LLM is allowed
   to be inexact on the exact growth factor, but a smaller-at-bigger
   total is a hallucination we don't accept.
3. **No fabricated KB cost** — when `cite.kind == "kb"` AND the KB
   record's `baseline_cost_usd_per_month` is set, `base_cost_usd`
   must be within `[0.25×, 4×]` of the KB number. This catches the
   common failure mode of the LLM ignoring the supplied baseline.

A failure of any check on the retry raises `CostEstimationError`; the
runner marks the run failed.

Public surface: ``estimate(normalized, synthesis, findings,
kb_candidates, *, router) -> CostEstimate``.
"""

from __future__ import annotations

import json
import re
from importlib import resources
from pathlib import Path

from pydantic import ValidationError

from tessar.kb import KbRecord
from tessar.llm import LlmMessage, LlmRouter
from tessar.schemas import (
    CostEstimate,
    NormalizedBrief,
    ResearchFindings,
    Synthesis,
)

AGENT_NAME = "cost_estimator"
PROMPT_VERSION = "v1"

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)

# Tolerance band on KB-cited line cost vs supplied
# `baseline_cost_usd_per_month`. Wide enough to allow regional /
# scale adjustments documented in `assumptions`; tight enough to
# catch the LLM ignoring the baseline entirely.
_KB_COST_LOWER = 0.25
_KB_COST_UPPER = 4.0


class CostEstimationError(RuntimeError):
    """Cost estimator produced output that failed validation or
    admissibility twice."""

    def __init__(self, message: str, *, raw_text: str, validation_error: str) -> None:
        super().__init__(message)
        self.raw_text = raw_text
        self.validation_error = validation_error


def _load_prompt() -> str:
    here = Path(__file__).resolve()
    repo_root = here.parents[4]
    prompt_path = repo_root / "packages" / "prompts" / AGENT_NAME / f"{PROMPT_VERSION}.md"
    if not prompt_path.is_file():
        try:
            return (
                resources.files("packages.prompts")
                .joinpath(f"{AGENT_NAME}/{PROMPT_VERSION}.md")
                .read_text(encoding="utf-8")
            )
        except (ModuleNotFoundError, FileNotFoundError) as e:
            raise FileNotFoundError(
                f"prompt not found at {prompt_path}; "
                f"check packages/prompts/{AGENT_NAME}/{PROMPT_VERSION}.md"
            ) from e
    return prompt_path.read_text(encoding="utf-8")


def _split_system_user(
    prompt_md: str,
    *,
    normalized_json: str,
    synthesis_json: str,
    findings_json: str,
    kb_json: str,
) -> list[LlmMessage]:
    parts = prompt_md.split("## User", 1)
    if len(parts) != 2:
        raise ValueError("prompt template missing '## User' section")
    system_block = parts[0].split("## System", 1)
    if len(system_block) != 2:
        raise ValueError("prompt template missing '## System' section")
    system_text = system_block[1].strip()
    user_text = (
        parts[1]
        .strip()
        .replace("{{NORMALIZED_BRIEF_JSON}}", normalized_json)
        .replace("{{SYNTHESIS_JSON}}", synthesis_json)
        .replace("{{FINDINGS_JSON}}", findings_json)
        .replace("{{KB_CANDIDATES_JSON}}", kb_json)
    )
    return [
        LlmMessage(role="system", content=system_text),
        LlmMessage(role="user", content=user_text),
    ]


def _strip_fences(text: str) -> str:
    return _FENCE.sub("", text).strip()


def _kb_to_prompt_dicts(kb_candidates: list[KbRecord]) -> list[dict]:
    """Slim KB records to the cost-relevant subset. Keeps
    `baseline_cost_usd_per_month` + `baseline_cost_assumptions` (which
    `_kb_to_prompt_dicts` in synthesizer / architect strip)."""
    out: list[dict] = []
    for r in kb_candidates:
        out.append(
            {
                "id": r.id,
                "name": r.name,
                "category": r.category,
                "vendor": r.vendor,
                "cloud": r.cloud,
                "pricing_model": r.pricing_model,
                "baseline_cost_usd_per_month": r.baseline_cost_usd_per_month,
                "baseline_cost_assumptions": r.baseline_cost_assumptions,
                "regions": list(r.regions),
            }
        )
    return out


def _admissibility_errors(
    estimate: CostEstimate,
    *,
    kb_records: dict[str, KbRecord],
    finding_ids: set[str],
) -> list[str]:
    """Return human-readable errors for ungrounded cites, fabricated
    KB costs, or rollup inversions. Empty list = clean output."""
    errors: list[str] = []

    # 1. citation grounding + cost-fabrication check
    for line in estimate.lines:
        cite = line.cite
        if cite.kind == "kb":
            kb = kb_records.get(cite.ref)
            if kb is None:
                errors.append(f"{line.id} cites kb:{cite.ref!r} but that KB id was not supplied")
                continue
            baseline = kb.baseline_cost_usd_per_month
            if baseline is not None and baseline > 0:
                low = baseline * _KB_COST_LOWER
                high = baseline * _KB_COST_UPPER
                if not (low <= line.base_cost_usd <= high):
                    errors.append(
                        f"{line.id} base_cost_usd={line.base_cost_usd:.2f} "
                        f"is outside [{low:.2f}, {high:.2f}] for KB "
                        f"{cite.ref!r} (baseline {baseline:.2f}); explain "
                        "in assumptions or pick a closer number"
                    )
        elif cite.kind == "finding" and cite.ref not in finding_ids:
            errors.append(f"{line.id} cites finding:{cite.ref!r} but no such finding was returned")

    # 2. roll-up monotonicity
    if estimate.monthly_at_10x_usd < estimate.monthly_baseline_usd:
        errors.append(
            f"monthly_at_10x_usd ({estimate.monthly_at_10x_usd:.2f}) is less "
            f"than baseline ({estimate.monthly_baseline_usd:.2f})"
        )
    if estimate.monthly_at_100x_usd < estimate.monthly_at_10x_usd:
        errors.append(
            f"monthly_at_100x_usd ({estimate.monthly_at_100x_usd:.2f}) is "
            f"less than 10x ({estimate.monthly_at_10x_usd:.2f})"
        )

    return errors


def _parse(text: str) -> CostEstimate:
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    return CostEstimate.model_validate(data)


def estimate(
    normalized: NormalizedBrief,
    synthesis: Synthesis,
    findings: ResearchFindings,
    kb_candidates: list[KbRecord],
    *,
    router: LlmRouter,
) -> CostEstimate:
    """Run the cost_estimator node.

    One retry on validation OR admissibility failure. Two failures →
    `CostEstimationError`; runner marks the run failed + refunds.
    """
    prompt_md = _load_prompt()
    normalized_json = normalized.model_dump_json(exclude_none=False)
    synthesis_json = synthesis.model_dump_json(exclude_none=False)
    findings_json = findings.model_dump_json(exclude_none=False)
    kb_json = json.dumps(_kb_to_prompt_dicts(kb_candidates), separators=(",", ":"))

    messages = _split_system_user(
        prompt_md,
        normalized_json=normalized_json,
        synthesis_json=synthesis_json,
        findings_json=findings_json,
        kb_json=kb_json,
    )

    kb_records = {r.id: r for r in kb_candidates}
    finding_ids = {f.question_id for f in findings.findings}

    response = router.generate(messages, agent_name=AGENT_NAME, max_tokens=3000, temperature=0.1)

    first_err: str | None = None
    try:
        est = _parse(response.text)
        admissibility = _admissibility_errors(est, kb_records=kb_records, finding_ids=finding_ids)
        if not admissibility:
            return est
        first_err = "Cost estimate rejected:\n- " + "\n- ".join(admissibility)
    except (ValidationError, json.JSONDecodeError) as e:
        first_err = str(e)

    retry_messages: list[LlmMessage] = [
        *messages,
        LlmMessage(role="assistant", content=response.text),
        LlmMessage(
            role="user",
            content=(
                "Your previous response was rejected:\n\n"
                f"{first_err}\n\n"
                "Output a corrected JSON object only. No prose, no fences. "
                "Every line.cite MUST reference a supplied KB id or an "
                "RQ-NN with a finding. KB-cited lines must price within "
                "0.25×–4× of the KB baseline (deviations explained in "
                "assumptions). Roll-up totals must be monotonic: "
                "baseline ≤ 10× ≤ 100×."
            ),
        ),
    ]
    retry = router.generate(retry_messages, agent_name=AGENT_NAME, max_tokens=3000, temperature=0.1)
    try:
        est = _parse(retry.text)
    except (ValidationError, json.JSONDecodeError) as second_err:
        raise CostEstimationError(
            "cost_estimator produced invalid JSON twice",
            raw_text=retry.text,
            validation_error=str(second_err),
        ) from second_err

    admissibility = _admissibility_errors(est, kb_records=kb_records, finding_ids=finding_ids)
    if admissibility:
        raise CostEstimationError(
            "cost_estimator produced ungrounded or inconsistent output twice",
            raw_text=retry.text,
            validation_error="; ".join(admissibility),
        )
    return est
