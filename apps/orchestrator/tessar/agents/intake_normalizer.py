"""intake_normalizer — first node of the agent graph.

Tier-C call. Strict JSON output validated against `NormalizedBrief`. On
validation failure, performs **one** retry with the validation error
appended to the prompt. Validation failures are NOT a router-fallback
trigger (the router only falls back on transient infra errors).

Public surface: `normalize(brief, *, router) -> NormalizedBrief`.
"""

from __future__ import annotations

import json
import re
from importlib import resources

from pydantic import ValidationError

from tessar.llm import LlmMessage, LlmRouter
from tessar.paths import repo_root as _repo_root
from tessar.schemas import BriefInput, NormalizedBrief

AGENT_NAME = "intake_normalizer"
PROMPT_VERSION = "v1"

# Hard JSON-fence detector — accepts ```json ... ``` or bare ```...```.
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


class IntakeNormalizationError(RuntimeError):
    """LLM produced JSON that failed `NormalizedBrief` validation twice."""

    def __init__(self, message: str, *, raw_text: str, validation_error: str) -> None:
        super().__init__(message)
        self.raw_text = raw_text
        self.validation_error = validation_error


def _load_prompt() -> str:
    """Load the versioned prompt template from `packages/prompts/`.

    The prompts package is plain markdown on disk (not a Python package),
    so we resolve the path relative to the repo root rather than via
    `importlib.resources`.
    """
    repo_root = _repo_root()
    prompt_path = repo_root / "packages" / "prompts" / AGENT_NAME / f"{PROMPT_VERSION}.md"
    if not prompt_path.is_file():
        # Fall back to importlib.resources in case packaging changes later.
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


def _split_system_user(prompt_md: str, *, brief: str, guide_json: str) -> list[LlmMessage]:
    """Split the prompt template on `## System` / `## User` and substitute
    the placeholders. The template format is:

        ## System
        ...system text...

        ## User
        ...user text with {{BRIEF_TEXT}} and {{GUIDE_JSON}}...
    """
    parts = prompt_md.split("## User", 1)
    if len(parts) != 2:
        raise ValueError("prompt template missing '## User' section")
    system_block = parts[0].split("## System", 1)
    if len(system_block) != 2:
        raise ValueError("prompt template missing '## System' section")
    system_text = system_block[1].strip()
    user_text = (
        parts[1].strip().replace("{{BRIEF_TEXT}}", brief).replace("{{GUIDE_JSON}}", guide_json)
    )
    return [
        LlmMessage(role="system", content=system_text),
        LlmMessage(role="user", content=user_text),
    ]


def _strip_fences(text: str) -> str:
    """Some models still wrap JSON in ```json ... ``` despite instructions.
    Strip a single outer fence if present."""
    return _FENCE.sub("", text).strip()


def _parse(text: str) -> NormalizedBrief:
    """Parse + validate. Raises `ValidationError` or `json.JSONDecodeError`."""
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    return NormalizedBrief.model_validate(data)


def normalize(brief: BriefInput, *, router: LlmRouter) -> NormalizedBrief:
    """Run the intake_normalizer node.

    Single retry on validation failure (NOT on transient errors — those
    are the router's job). After two failures, raises
    `IntakeNormalizationError`. Caller should mark the run failed and
    refund the user.
    """
    prompt_md = _load_prompt()
    guide_json = brief.guide.model_dump_json(exclude_none=True)
    messages = _split_system_user(prompt_md, brief=brief.brief, guide_json=guide_json)

    response = router.generate(messages, agent_name=AGENT_NAME, max_tokens=2000, temperature=0.0)
    try:
        return _parse(response.text)
    except (ValidationError, json.JSONDecodeError) as first_err:
        # Retry once with the error appended so the model can self-correct.
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
            retry_messages, agent_name=AGENT_NAME, max_tokens=2000, temperature=0.0
        )
        try:
            return _parse(retry.text)
        except (ValidationError, json.JSONDecodeError) as second_err:
            raise IntakeNormalizationError(
                "intake_normalizer produced invalid JSON twice",
                raw_text=retry.text,
                validation_error=str(second_err),
            ) from second_err
