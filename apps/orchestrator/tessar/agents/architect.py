"""architect — fifth real node of the agent graph (Phase 3.8).

Tier-A. Strict JSON output validated against `Architecture`. Same
single-retry-on-failure pattern as `synthesizer`, with two
admissibility checks beyond Pydantic:

1. **Citation grounding** — every `ArchNode.cite` must reference a
   supplied KB id or a returned `RQ-NN` finding (failed research
   questions are NOT evidence). Mirrors the synthesizer rule.
2. **Topology integrity** — every edge's `from`/`to` and every flow's
   `nodes[]` entry must reference a defined `node.id`; no self-loops.

A failure of either check on the retry raises `ArchitectureError`; the
runner marks the run failed.

Public surface: ``architect(normalized, requirements, synthesis,
findings, kb_candidates, *, router) -> Architecture``.
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
    Architecture,
    NormalizedBrief,
    Requirements,
    ResearchFindings,
    Synthesis,
)

AGENT_NAME = "architect"
PROMPT_VERSION = "v1"

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


class ArchitectureError(RuntimeError):
    """Architect produced output that failed validation or admissibility twice."""

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
    requirements_json: str,
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
        .replace("{{REQUIREMENTS_JSON}}", requirements_json)
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
    """Same shape as `synthesizer._kb_to_prompt_dicts` — slim records to
    the fields the architect needs to wire + cite."""
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
            }
        )
    return out


def _admissibility_errors(
    arch: Architecture,
    *,
    kb_ids: set[str],
    finding_ids: set[str],
) -> list[str]:
    """Return human-readable errors for ungrounded citations or broken
    topology. Empty list = clean output."""
    errors: list[str] = []
    node_ids = {n.id for n in arch.nodes}

    # 1. citation grounding
    for n in arch.nodes:
        cite = n.cite
        if cite.kind == "kb" and cite.ref not in kb_ids:
            errors.append(f"{n.id} cites kb:{cite.ref!r} but that KB id was not supplied")
        elif cite.kind == "finding" and cite.ref not in finding_ids:
            errors.append(f"{n.id} cites finding:{cite.ref!r} but no such finding was returned")

    # 2. topology — edges
    for i, e in enumerate(arch.edges):
        if e.src not in node_ids:
            errors.append(f"edge[{i}] from={e.src!r} is not a defined node id")
        if e.to not in node_ids:
            errors.append(f"edge[{i}] to={e.to!r} is not a defined node id")
        if e.src == e.to:
            errors.append(f"edge[{i}] is a self-loop on {e.src!r}")

    # 3. topology — flows
    for f in arch.flows:
        for ref in f.nodes:
            if ref not in node_ids:
                errors.append(f"flow {f.id} references node {ref!r} which is not defined")

    # 4. failure_domain integrity (cheap belt-and-braces)
    for n in arch.nodes:
        for ref in n.failure_domain:
            if ref not in node_ids:
                errors.append(f"{n.id}.failure_domain references {ref!r} which is not a node")
            elif ref == n.id:
                errors.append(f"{n.id}.failure_domain includes itself")

    return errors


def _parse(text: str) -> Architecture:
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    return Architecture.model_validate(data)


def architect(
    normalized: NormalizedBrief,
    requirements: Requirements,
    synthesis: Synthesis,
    findings: ResearchFindings,
    kb_candidates: list[KbRecord],
    *,
    router: LlmRouter,
) -> Architecture:
    """Run the architect node.

    One retry on validation OR admissibility failure. Two failures →
    `ArchitectureError`; runner marks the run failed + refunds.
    """
    prompt_md = _load_prompt()
    normalized_json = normalized.model_dump_json(exclude_none=False)
    requirements_json = requirements.model_dump_json(exclude_none=False)
    synthesis_json = synthesis.model_dump_json(exclude_none=False)
    findings_json = findings.model_dump_json(exclude_none=False)
    kb_json = json.dumps(_kb_to_prompt_dicts(kb_candidates), separators=(",", ":"))

    messages = _split_system_user(
        prompt_md,
        normalized_json=normalized_json,
        requirements_json=requirements_json,
        synthesis_json=synthesis_json,
        findings_json=findings_json,
        kb_json=kb_json,
    )

    kb_ids = {r.id for r in kb_candidates}
    finding_ids = {f.question_id for f in findings.findings}

    response = router.generate(messages, agent_name=AGENT_NAME, max_tokens=6000, temperature=0.2)

    first_err: str | None = None
    try:
        arch = _parse(response.text)
        admissibility = _admissibility_errors(arch, kb_ids=kb_ids, finding_ids=finding_ids)
        if not admissibility:
            return arch
        first_err = "Architecture rejected:\n- " + "\n- ".join(admissibility)
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
                "Every node.cite MUST reference a supplied KB id or a RQ-NN "
                "with a finding. Every edge from/to and every flow.nodes[] "
                "entry MUST reference a defined node id. No self-loops."
            ),
        ),
    ]
    retry = router.generate(retry_messages, agent_name=AGENT_NAME, max_tokens=6000, temperature=0.2)
    try:
        arch = _parse(retry.text)
    except (ValidationError, json.JSONDecodeError) as second_err:
        raise ArchitectureError(
            "architect produced invalid JSON twice",
            raw_text=retry.text,
            validation_error=str(second_err),
        ) from second_err

    admissibility = _admissibility_errors(arch, kb_ids=kb_ids, finding_ids=finding_ids)
    if admissibility:
        raise ArchitectureError(
            "architect produced ungrounded or topologically broken output twice",
            raw_text=retry.text,
            validation_error="; ".join(admissibility),
        )
    return arch
