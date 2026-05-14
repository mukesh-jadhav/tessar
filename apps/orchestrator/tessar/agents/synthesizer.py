"""synthesizer — first frontier-tier node of the agent graph.

Tier-A call. Strict JSON output validated against `Synthesis`. Same
single-retry-on-validation-failure pattern as `research_planner`, but
with one extra check: every `Decision.citations[]` entry must reference
either a KB record id we supplied OR a `RQ-NN` for which the worker
fan-out actually returned a finding (not an error). Picks that fail
this admissibility check are treated like a validation failure — we
retry once with the offending refs called out, then raise.

Public surface: ``synthesize(normalized, requirements, plan, findings,
kb_candidates, *, router) -> Synthesis``.
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
    NormalizedBrief,
    Requirements,
    ResearchFindings,
    ResearchPlan,
    Synthesis,
)

AGENT_NAME = "synthesizer"
PROMPT_VERSION = "v1"

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


class SynthesisError(RuntimeError):
    """LLM produced output that failed validation or admissibility twice."""

    def __init__(self, message: str, *, raw_text: str, validation_error: str) -> None:
        super().__init__(message)
        self.raw_text = raw_text
        self.validation_error = validation_error


def _load_prompt() -> str:
    repo_root = _repo_root()
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
    requirements_json: str,
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
    """Slim KB records to just the fields the synthesizer needs to
    pick + cite. Keeps the prompt cheap on tokens."""
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
                "alternatives": [
                    {"id": a.id, "why_not_default": a.why_not_default} for a in r.alternatives
                ],
            }
        )
    return out


def _admissibility_errors(
    synthesis: Synthesis,
    *,
    kb_ids: set[str],
    finding_ids: set[str],
) -> list[str]:
    """Return a list of human-readable errors for citations that
    reference unknown KB ids or RQ-NNs without findings. Empty list
    means every citation is grounded."""
    errors: list[str] = []
    for decision in synthesis.decisions:
        for cite in decision.citations:
            if cite.kind == "kb" and cite.ref not in kb_ids:
                errors.append(
                    f"{decision.id} cites kb:{cite.ref!r} but that KB id was not supplied"
                )
            elif cite.kind == "finding" and cite.ref not in finding_ids:
                errors.append(
                    f"{decision.id} cites finding:{cite.ref!r} but no such finding "
                    "was returned (it may have failed; failed questions are not evidence)"
                )
    return errors


def _parse(text: str) -> Synthesis:
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    return Synthesis.model_validate(data)


def synthesize(
    normalized: NormalizedBrief,
    requirements: Requirements,
    plan: ResearchPlan,
    findings: ResearchFindings,
    kb_candidates: list[KbRecord],
    *,
    router: LlmRouter,
) -> Synthesis:
    """Run the synthesizer node.

    One retry on validation OR admissibility failure. After two failures
    raises `SynthesisError`; caller marks the run failed + refunds.
    """
    prompt_md = _load_prompt()
    normalized_json = normalized.model_dump_json(exclude_none=False)
    requirements_json = requirements.model_dump_json(exclude_none=False)
    findings_json = findings.model_dump_json(exclude_none=False)
    kb_json = json.dumps(_kb_to_prompt_dicts(kb_candidates), separators=(",", ":"))

    messages = _split_system_user(
        prompt_md,
        normalized_json=normalized_json,
        requirements_json=requirements_json,
        findings_json=findings_json,
        kb_json=kb_json,
    )

    kb_ids = {r.id for r in kb_candidates}
    finding_ids = {f.question_id for f in findings.findings}

    response = router.generate(messages, agent_name=AGENT_NAME, max_tokens=4000, temperature=0.2)

    first_err: str | None = None
    try:
        synthesis = _parse(response.text)
        admissibility = _admissibility_errors(synthesis, kb_ids=kb_ids, finding_ids=finding_ids)
        if not admissibility:
            return synthesis
        first_err = "Ungrounded citations:\n- " + "\n- ".join(admissibility)
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
                "Every citation MUST reference a supplied KB id or a RQ-NN "
                "that has a finding."
            ),
        ),
    ]
    retry = router.generate(retry_messages, agent_name=AGENT_NAME, max_tokens=4000, temperature=0.2)
    try:
        synthesis = _parse(retry.text)
    except (ValidationError, json.JSONDecodeError) as second_err:
        raise SynthesisError(
            "synthesizer produced invalid JSON twice",
            raw_text=retry.text,
            validation_error=str(second_err),
        ) from second_err

    admissibility = _admissibility_errors(synthesis, kb_ids=kb_ids, finding_ids=finding_ids)
    if admissibility:
        raise SynthesisError(
            "synthesizer produced ungrounded citations twice",
            raw_text=retry.text,
            validation_error="; ".join(admissibility),
        )
    return synthesis
