"""research_planner — third node of the agent graph.

Tier-B call. Strict JSON output validated against `ResearchPlan`. Same
single-retry-on-validation-failure pattern as `requirements_extractor`;
validation failures are NOT a router-fallback trigger (the router only
falls back on transient infra errors).

Public surface: ``plan(normalized, requirements, *, router) -> ResearchPlan``.
"""

from __future__ import annotations

import json
import re
from importlib import resources
from pathlib import Path

from pydantic import ValidationError

from tessar.llm import LlmMessage, LlmRouter
from tessar.schemas import NormalizedBrief, Requirements, ResearchPlan

AGENT_NAME = "research_planner"
PROMPT_VERSION = "v1"

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


class ResearchPlanningError(RuntimeError):
    """LLM produced JSON that failed `ResearchPlan` validation twice."""

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
    prompt_md: str, *, normalized_json: str, requirements_json: str
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
    )
    return [
        LlmMessage(role="system", content=system_text),
        LlmMessage(role="user", content=user_text),
    ]


def _strip_fences(text: str) -> str:
    return _FENCE.sub("", text).strip()


def _parse(text: str) -> ResearchPlan:
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    return ResearchPlan.model_validate(data)


def plan(
    normalized: NormalizedBrief,
    requirements: Requirements,
    *,
    router: LlmRouter,
) -> ResearchPlan:
    """Run the research_planner node.

    One retry on validation failure. After two failures, raises
    `ResearchPlanningError`; caller marks the run failed + refunds.
    """
    prompt_md = _load_prompt()
    normalized_json = normalized.model_dump_json(exclude_none=False)
    requirements_json = requirements.model_dump_json(exclude_none=False)
    messages = _split_system_user(
        prompt_md,
        normalized_json=normalized_json,
        requirements_json=requirements_json,
    )

    response = router.generate(messages, agent_name=AGENT_NAME, max_tokens=2400, temperature=0.2)
    try:
        return _parse(response.text)
    except (ValidationError, json.JSONDecodeError) as first_err:
        retry_messages: list[LlmMessage] = [
            *messages,
            LlmMessage(role="assistant", content=response.text),
            LlmMessage(
                role="user",
                content=(
                    "Your previous response failed validation:\n\n"
                    f"{first_err}\n\n"
                    "Output a corrected JSON object only. No prose, no fences."
                ),
            ),
        ]
        retry = router.generate(
            retry_messages, agent_name=AGENT_NAME, max_tokens=2400, temperature=0.2
        )
        try:
            return _parse(retry.text)
        except (ValidationError, json.JSONDecodeError) as second_err:
            raise ResearchPlanningError(
                "research_planner produced invalid JSON twice",
                raw_text=retry.text,
                validation_error=str(second_err),
            ) from second_err
