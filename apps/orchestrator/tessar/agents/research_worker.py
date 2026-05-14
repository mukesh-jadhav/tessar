"""research_worker — fan-out node of the agent graph.

Tier-B call. For each question in a `ResearchPlan`, the orchestrator:

  1. issues a search via the configured `SearchClient`,
  2. feeds the question + numbered citations to the LLM,
  3. validates the response against `ResearchFinding`.

Per-question failures (no hits, two LLM-validation failures, transient
search errors) are captured into `ResearchFindings.errors[]` rather
than killing the whole run. The synthesizer downgrades decisions whose
question-id appears only in `errors[]`.

Public surface:
  - ``research_one(question, *, router, search) -> ResearchFinding``
  - ``research_all(plan, *, router, search, concurrency=4)
        -> ResearchFindings``
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import UTC, datetime
from importlib import resources

from pydantic import ValidationError

from tessar.llm import LlmMessage, LlmRouter
from tessar.paths import repo_root as _repo_root
from tessar.schemas import (
    Citation,
    ResearchError,
    ResearchFinding,
    ResearchFindings,
    ResearchPlan,
    ResearchQuestion,
)
from tessar.search import (
    SearchClient,
    SearchError,
    SearchHit,
    SearchQuery,
)

AGENT_NAME = "research_worker"
PROMPT_VERSION = "v1"
DEFAULT_MAX_RESULTS = 5
DEFAULT_CONCURRENCY = 4

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


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
    prompt_md: str, *, question_json: str, citations_json: str
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
        .replace("{{QUESTION_JSON}}", question_json)
        .replace("{{CITATIONS_JSON}}", citations_json)
    )
    return [
        LlmMessage(role="system", content=system_text),
        LlmMessage(role="user", content=user_text),
    ]


def _strip_fences(text: str) -> str:
    return _FENCE.sub("", text).strip()


def _parse_finding(text: str, *, expected_id: str) -> ResearchFinding:
    """Parse + validate; also enforce that the model returned the right
    question_id (the schema would let the LLM rewrite it)."""
    cleaned = _strip_fences(text)
    data = json.loads(cleaned)
    finding = ResearchFinding.model_validate(data)
    if finding.question_id != expected_id:
        raise ValueError(
            f"finding.question_id={finding.question_id!r} does not match "
            f"input question id {expected_id!r}"
        )
    return finding


def _hits_to_citation_blocks(hits: list[SearchHit]) -> tuple[str, list[Citation]]:
    """Build the numbered citations payload for the prompt AND the
    schema-shaped citation rows the model is expected to copy back.

    Returning both lets the runner fall back to the search-supplied
    citations if the model truncates them (defensive: a future model
    upgrade might decide to "summarize" the citation list)."""
    retrieved_at = datetime.now(UTC)
    blocks: list[dict[str, str | int | None]] = []
    citations: list[Citation] = []
    for idx, hit in enumerate(hits, start=1):
        blocks.append(
            {
                "n": idx,
                "url": hit.url,
                "title": hit.title,
                "publisher": hit.publisher,
                "published_at": hit.published_at.isoformat() if hit.published_at else None,
                "retrieved_at": retrieved_at.isoformat(),
                "content": hit.content[:6000] or hit.snippet,
            }
        )
        citations.append(
            Citation(
                url=hit.url,
                title=hit.title,
                snippet=(hit.snippet or hit.content)[:500],
                publisher=hit.publisher,
                retrieved_at=retrieved_at,
                published_at=hit.published_at,
            )
        )
    return json.dumps(blocks, ensure_ascii=False), citations


def _question_to_query(q: ResearchQuestion, *, max_results: int) -> SearchQuery:
    """Turn a research question into a search query.

    Prefer the planner's `keywords[]` (compact, search-engine-friendly)
    and fall back to the question text. Truncated to 300 chars per the
    `SearchQuery.query` schema bound.
    """
    if q.keywords:
        joined = " ".join(q.keywords)
    else:
        joined = q.question
    return SearchQuery(query=joined[:300], max_results=max_results)


def research_one(
    question: ResearchQuestion,
    *,
    router: LlmRouter,
    search: SearchClient,
    max_results: int = DEFAULT_MAX_RESULTS,
) -> ResearchFinding | ResearchError:
    """Answer one research question. Returns either a finding or a
    structured error — never raises for per-question issues. Only
    `BudgetExceeded` (from the router) is allowed to propagate, since
    that means the WHOLE run must abort.
    """
    try:
        hits = search.search(_question_to_query(question, max_results=max_results))
    except SearchError as e:
        return ResearchError(question_id=question.id, reason=f"search failed: {e}")

    if not hits:
        return ResearchError(question_id=question.id, reason="no search hits")

    citations_json, _fallback_citations = _hits_to_citation_blocks(hits)
    question_json = question.model_dump_json()
    prompt_md = _load_prompt()
    messages = _split_system_user(
        prompt_md, question_json=question_json, citations_json=citations_json
    )

    response = router.generate(messages, agent_name=AGENT_NAME, max_tokens=6000, temperature=0.1)
    try:
        return _parse_finding(response.text, expected_id=question.id)
    except (ValidationError, json.JSONDecodeError, ValueError) as first_err:
        retry_messages: list[LlmMessage] = [
            *messages,
            LlmMessage(role="assistant", content=response.text),
            LlmMessage(
                role="user",
                content=(
                    "Your previous response failed validation:\n\n"
                    f"{first_err}\n\n"
                    "Output a corrected JSON object only. No prose, no fences. "
                    f"Remember: question_id MUST be exactly {question.id!r}."
                ),
            ),
        ]
        retry = router.generate(
            retry_messages, agent_name=AGENT_NAME, max_tokens=6000, temperature=0.1
        )
        try:
            return _parse_finding(retry.text, expected_id=question.id)
        except (ValidationError, json.JSONDecodeError, ValueError) as second_err:
            return ResearchError(
                question_id=question.id,
                reason=(f"validation failed twice: {second_err}")[:500],
            )


async def research_all(
    plan: ResearchPlan,
    *,
    router: LlmRouter,
    search: SearchClient,
    concurrency: int = DEFAULT_CONCURRENCY,
    max_results: int = DEFAULT_MAX_RESULTS,
) -> ResearchFindings:
    """Fan-out research across all questions with bounded parallelism.

    `concurrency` caps how many LLM + search calls run at once — the
    LangGraph runtime in Phase 3 will manage this differently, but for
    now an `asyncio.Semaphore` is enough and keeps the unit tests
    hermetic. `BudgetExceeded` from any worker aborts the whole gather
    (the router's per-run budget is the ultimate cost guard).
    """
    sem = asyncio.Semaphore(max(1, concurrency))

    async def _one(q: ResearchQuestion) -> ResearchFinding | ResearchError:
        async with sem:
            return await asyncio.to_thread(
                research_one,
                q,
                router=router,
                search=search,
                max_results=max_results,
            )

    results = await asyncio.gather(*(_one(q) for q in plan.questions))

    findings: list[ResearchFinding] = []
    errors: list[ResearchError] = []
    for r in results:
        if isinstance(r, ResearchFinding):
            findings.append(r)
        else:
            errors.append(r)
    return ResearchFindings(findings=findings, errors=errors)
