"""requirements_extractor — second node of the agent graph.

Tier-B call. Strict JSON output validated against `Requirements`. On
validation failure, performs **one** retry with the validation error
appended to the prompt. Validation failures are NOT a router-fallback
trigger (the router only falls back on transient infra errors).

Public surface: `extract(brief, normalized, *, router) -> Requirements`.

The "≤3 clarify questions" loop from `product-goals.instructions.md`
is NOT a synchronous mid-run pause in MVP. The agent emits up to three
clarify questions in `Requirements.open_questions`, the runner forwards
them into the final package's open-questions section, and the user can
answer them on a re-run. This keeps the run autonomous (the 8–15-min
SLA in MVP §1) while preserving the trust requirement that
unanswered questions are never silently swallowed.
"""

from __future__ import annotations

import json
import re
from importlib import resources

from pydantic import ValidationError

from tessar.llm import LlmMessage, LlmRouter
from tessar.paths import repo_root as _repo_root
from tessar.schemas import BriefInput, NormalizedBrief, Requirements

AGENT_NAME = "requirements_extractor"
PROMPT_VERSION = "v1"

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


class RequirementsExtractionError(RuntimeError):
    """LLM produced JSON that failed `Requirements` validation twice."""

    def __init__(self, message: str, *, raw_text: str, validation_error: str) -> None:
        super().__init__(message)
        self.raw_text = raw_text
        self.validation_error = validation_error


def _load_prompt() -> str:
    """Load the versioned prompt template from `packages/prompts/`.

    Mirrors `intake_normalizer._load_prompt`; see that for the path
    rationale (apps/orchestrator/tessar/agents/<file> → parents[4] is
    the repo root).
    """
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
    prompt_md: str, *, brief_text: str, normalized_json: str
) -> list[LlmMessage]:
    """Split the prompt template on `## System` / `## User` and substitute
    `{{NORMALIZED_BRIEF_JSON}}` and `{{BRIEF_TEXT}}`."""
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
        .replace("{{BRIEF_TEXT}}", brief_text)
    )
    return [
        LlmMessage(role="system", content=system_text),
        LlmMessage(role="user", content=user_text),
    ]


def _strip_fences(text: str) -> str:
    return _FENCE.sub("", text).strip()


def _parse(text: str) -> Requirements:
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    return Requirements.model_validate(data)


def extract(
    brief: BriefInput,
    normalized: NormalizedBrief,
    *,
    router: LlmRouter,
) -> Requirements:
    """Run the requirements_extractor node.

    Single retry on validation failure (NOT on transient errors — those
    are the router's job). After two failures, raises
    `RequirementsExtractionError`. Caller marks the run failed + refunds.
    """
    prompt_md = _load_prompt()
    normalized_json = normalized.model_dump_json(exclude_none=False)
    messages = _split_system_user(
        prompt_md, brief_text=brief.brief, normalized_json=normalized_json
    )

    response = router.generate(messages, agent_name=AGENT_NAME, max_tokens=8000, temperature=0.1)
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
            retry_messages, agent_name=AGENT_NAME, max_tokens=8000, temperature=0.1
        )
        try:
            return _parse(retry.text)
        except (ValidationError, json.JSONDecodeError) as second_err:
            raise RequirementsExtractionError(
                "requirements_extractor produced invalid JSON twice",
                raw_text=retry.text,
                validation_error=str(second_err),
            ) from second_err
