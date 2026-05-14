"""risk_writer — seventh real node of the agent graph (Phase 3.10).

Tier-A. Strict JSON output validated against `Risks`. Same single-
retry-on-failure pattern as the other agents, with two admissibility
checks beyond Pydantic:

1. **Citation grounding** — every `Risk.citations[]` entry must
   reference a supplied KB id or a returned `RQ-NN` finding (mirrors
   the synthesizer / architect / cost_estimator rule).
2. **Component-id grounding** — when a `Risk.component_id` is set,
   it must reference either a `Decision.component_id` from the
   synthesis OR an `ArchNode.id` from the architecture. Dangling
   cross-links are a hallucination we don't accept.

A failure of either check on the retry raises `RiskWritingError`;
the runner marks the run failed.

Public surface: ``write_risks(normalized, requirements, synthesis,
architecture, cost, findings, kb_candidates, *, router) -> Risks``.
"""

from __future__ import annotations

import json
import re
from importlib import resources

from pydantic import ValidationError

from tessar.kb import KbRecord
from tessar.llm import LlmMessage, LlmRouter
from tessar.paths import repo_root as _repo_root
from tessar.schemas import (
    Architecture,
    CostEstimate,
    NormalizedBrief,
    Requirements,
    ResearchFindings,
    Risks,
    Synthesis,
)

# Use the canonical agent name from MVP.md §3.4 for tier routing
# (Tier-A). The prompt directory uses the short alias `risk_writer`
# to match the canned-timeline phase id.
AGENT_NAME = "risk_and_tradeoff_writer"
PROMPT_DIR = "risk_writer"
PROMPT_VERSION = "v1"

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


class RiskWritingError(RuntimeError):
    """Risk writer produced output that failed validation or
    admissibility twice."""

    def __init__(self, message: str, *, raw_text: str, validation_error: str) -> None:
        super().__init__(message)
        self.raw_text = raw_text
        self.validation_error = validation_error


def _load_prompt() -> str:
    repo_root = _repo_root()
    prompt_path = repo_root / "packages" / "prompts" / PROMPT_DIR / f"{PROMPT_VERSION}.md"
    if not prompt_path.is_file():
        try:
            return (
                resources.files("packages.prompts")
                .joinpath(f"{PROMPT_DIR}/{PROMPT_VERSION}.md")
                .read_text(encoding="utf-8")
            )
        except (ModuleNotFoundError, FileNotFoundError) as e:
            raise FileNotFoundError(
                f"prompt not found at {prompt_path}; "
                f"check packages/prompts/{PROMPT_DIR}/{PROMPT_VERSION}.md"
            ) from e
    return prompt_path.read_text(encoding="utf-8")


def _split_system_user(
    prompt_md: str,
    *,
    normalized_json: str,
    requirements_json: str,
    synthesis_json: str,
    architecture_json: str,
    cost_json: str,
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
        .replace("{{REQUIREMENTS_JSON}}", requirements_json)
        .replace("{{SYNTHESIS_JSON}}", synthesis_json)
        .replace("{{ARCHITECTURE_JSON}}", architecture_json)
        .replace("{{COST_JSON}}", cost_json)
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
    """Slim KB records to the risk-relevant subset. Keeps `compliance`
    + `regions` + `notes` (which downstream-only agents may strip)
    because risk reasoning leans on those signals."""
    out: list[dict] = []
    for r in kb_candidates:
        out.append(
            {
                "id": r.id,
                "name": r.name,
                "category": r.category,
                "vendor": r.vendor,
                "cloud": r.cloud,
                "capabilities": list(r.capabilities),
                "compliance": list(r.compliance),
                "regions": list(r.regions),
                "notes": r.notes,
            }
        )
    return out


def _admissibility_errors(
    risks: Risks,
    *,
    kb_records: dict[str, KbRecord],
    finding_ids: set[str],
    component_ids: set[str],
) -> list[str]:
    """Return human-readable errors for ungrounded citations or
    dangling component_id cross-links. Empty list = clean output."""
    errors: list[str] = []

    for risk in risks.risks:
        for cite in risk.citations:
            if cite.kind == "kb" and cite.ref not in kb_records:
                errors.append(f"{risk.id} cites kb:{cite.ref!r} but that KB id was not supplied")
            elif cite.kind == "finding" and cite.ref not in finding_ids:
                errors.append(
                    f"{risk.id} cites finding:{cite.ref!r} but no such finding was returned"
                )
        if risk.component_id is not None and risk.component_id not in component_ids:
            errors.append(
                f"{risk.id} component_id={risk.component_id!r} does not match any "
                "synthesis Decision.component_id or architecture ArchNode.id"
            )

    return errors


def _parse(text: str) -> Risks:
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    return Risks.model_validate(data)


def _component_id_index(synthesis: Synthesis, architecture: Architecture) -> set[str]:
    ids: set[str] = set()
    for d in synthesis.decisions:
        if d.component_id:
            ids.add(d.component_id)
    for n in architecture.nodes:
        ids.add(n.id)
    return ids


def write_risks(
    normalized: NormalizedBrief,
    requirements: Requirements,
    synthesis: Synthesis,
    architecture: Architecture,
    cost: CostEstimate,
    findings: ResearchFindings,
    kb_candidates: list[KbRecord],
    *,
    router: LlmRouter,
) -> Risks:
    """Run the risk_writer node.

    One retry on validation OR admissibility failure. Two failures →
    `RiskWritingError`; runner marks the run failed + refunds.
    """
    prompt_md = _load_prompt()
    normalized_json = normalized.model_dump_json(exclude_none=False)
    requirements_json = requirements.model_dump_json(exclude_none=False)
    synthesis_json = synthesis.model_dump_json(exclude_none=False)
    architecture_json = architecture.model_dump_json(exclude_none=False, by_alias=True)
    cost_json = cost.model_dump_json(exclude_none=False)
    findings_json = findings.model_dump_json(exclude_none=False)
    kb_json = json.dumps(_kb_to_prompt_dicts(kb_candidates), separators=(",", ":"))

    messages = _split_system_user(
        prompt_md,
        normalized_json=normalized_json,
        requirements_json=requirements_json,
        synthesis_json=synthesis_json,
        architecture_json=architecture_json,
        cost_json=cost_json,
        findings_json=findings_json,
        kb_json=kb_json,
    )

    kb_records = {r.id: r for r in kb_candidates}
    finding_ids = {f.question_id for f in findings.findings}
    component_ids = _component_id_index(synthesis, architecture)

    response = router.generate(messages, agent_name=AGENT_NAME, max_tokens=14000, temperature=0.3)

    first_err: str | None = None
    try:
        risks = _parse(response.text)
        admissibility = _admissibility_errors(
            risks,
            kb_records=kb_records,
            finding_ids=finding_ids,
            component_ids=component_ids,
        )
        if not admissibility:
            return risks
        first_err = "Risks rejected:\n- " + "\n- ".join(admissibility)
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
                "Every risk.citations entry MUST reference a supplied KB id "
                "or an RQ-NN with a finding. Every risk.component_id (when "
                "set) MUST match a synthesis Decision.component_id or an "
                "architecture ArchNode.id."
            ),
        ),
    ]
    retry = router.generate(
        retry_messages, agent_name=AGENT_NAME, max_tokens=14000, temperature=0.3
    )
    try:
        risks = _parse(retry.text)
    except (ValidationError, json.JSONDecodeError) as second_err:
        raise RiskWritingError(
            "risk_writer produced invalid JSON twice",
            raw_text=retry.text,
            validation_error=str(second_err),
        ) from second_err

    admissibility = _admissibility_errors(
        risks,
        kb_records=kb_records,
        finding_ids=finding_ids,
        component_ids=component_ids,
    )
    if admissibility:
        raise RiskWritingError(
            "risk_writer produced ungrounded or dangling output twice",
            raw_text=retry.text,
            validation_error="; ".join(admissibility),
        )
    return risks
