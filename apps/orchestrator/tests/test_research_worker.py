"""Tests for the `research_worker` agent.

Hermetic via `MockLlmProvider` + `MockSearchProvider`. Covers per-
question shape, transient-search fallback, validation retry, fan-out
parallelism + bounded concurrency, error capture path, and budget
propagation.
"""

from __future__ import annotations

import asyncio
import json
import time

import pytest

from tessar.agents.research_worker import (
    _split_system_user,
    research_all,
    research_one,
)
from tessar.llm import BudgetExceeded, BudgetTracker, LlmRouter, Tier
from tessar.llm.providers.mock import MockLlmProvider
from tessar.schemas import (
    ResearchError,
    ResearchFinding,
    ResearchPlan,
    ResearchQuestion,
)
from tessar.search import SearchClient, SearchHit, SearchQuery
from tessar.search.providers.mock import MockSearchProvider

# ─── helpers ────────────────────────────────────────────────────


def _question(id_: str = "RQ-01") -> ResearchQuestion:
    return ResearchQuestion(
        id=id_,
        question="Is Cloud SQL pgvector fast enough at ~50k embeddings?",
        rationale="Wrong answer either over-spends on a vector DB or breaks p95.",
        category="component_choice",
        priority="high",
        keywords=["pgvector benchmark", "cloud sql vector", "p95 latency"],
        relates_to=["NFR-01"],
    )


def _hits() -> list[SearchHit]:
    return [
        SearchHit(
            url="https://example.com/pgvector-bench",
            title="pgvector at 1M rows",
            snippet="HNSW index recall 0.95 at 50ms p95 on 4-vCPU.",
            content="Benchmarks show pgvector with HNSW at recall 0.95 and p95 50ms.",
            publisher="Supabase Blog",
        ),
        SearchHit(
            url="https://example.com/pgvector-cloudsql",
            title="Cloud SQL Postgres + pgvector limits",
            snippet="Cloud SQL supports pgvector via extension; max 16k dims.",
            content="Cloud SQL Postgres supports pgvector; recommended for <1M vectors.",
            publisher="GCP Docs",
        ),
    ]


def _good_finding_payload(question_id: str = "RQ-01") -> dict[str, object]:
    return {
        "question_id": question_id,
        "summary": (
            "pgvector on Cloud SQL is fast enough at ~50k embeddings: "
            "HNSW indexing keeps p95 latency well under the 200ms NFR."
        ),
        "key_points": [
            {
                "statement": "HNSW recall 0.95 at p95 50ms on a 4-vCPU instance.",
                "cites": [1],
            },
            {
                "statement": "Cloud SQL ships pgvector and is fine for sub-1M-row datasets.",
                "cites": [2],
            },
        ],
        "citations": [
            {
                "url": "https://example.com/pgvector-bench",
                "title": "pgvector at 1M rows",
                "snippet": "HNSW index recall 0.95 at 50ms p95.",
                "publisher": "Supabase Blog",
                "retrieved_at": "2026-05-13T10:00:00+00:00",
                "published_at": None,
            },
            {
                "url": "https://example.com/pgvector-cloudsql",
                "title": "Cloud SQL Postgres + pgvector limits",
                "snippet": "Cloud SQL supports pgvector; recommended for <1M vectors.",
                "publisher": "GCP Docs",
                "retrieved_at": "2026-05-13T10:00:00+00:00",
                "published_at": None,
            },
        ],
        "confidence": "high",
        "open_questions": [],
    }


def _router(provider: MockLlmProvider) -> LlmRouter:
    return LlmRouter([provider], BudgetTracker(cap_usd=1.0, cap_tokens=100_000))


def _search(hits: list[SearchHit] | None = None) -> SearchClient:
    return SearchClient([MockSearchProvider(canned=hits if hits is not None else _hits())])


# ─── single-question happy path ───────────────────────────────


def test_research_one_happy_path() -> None:
    payload = json.dumps(_good_finding_payload())
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = research_one(_question(), router=_router(p), search=_search())

    assert isinstance(result, ResearchFinding)
    assert result.question_id == "RQ-01"
    assert result.confidence == "high"
    assert len(result.citations) == 2
    assert result.key_points[0].cites == [1]


def test_research_one_strips_json_fence() -> None:
    payload = "```json\n" + json.dumps(_good_finding_payload()) + "\n```"
    p = MockLlmProvider(responder=lambda _msgs, _tier: payload)
    result = research_one(_question(), router=_router(p), search=_search())
    assert isinstance(result, ResearchFinding)


def test_research_worker_uses_tier_b() -> None:
    captured: list[Tier] = []

    def responder(_msgs, tier):
        captured.append(tier)
        return json.dumps(_good_finding_payload())

    p = MockLlmProvider(responder=responder)
    research_one(_question(), router=_router(p), search=_search())
    assert captured == [Tier.B]


def test_search_query_uses_keywords_when_present() -> None:
    captured: list[SearchQuery] = []

    def responder(q: SearchQuery) -> list[SearchHit]:
        captured.append(q)
        return _hits()

    sp = MockSearchProvider(responder=responder)
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_finding_payload()))
    research_one(_question(), router=_router(p), search=SearchClient([sp]))

    assert len(captured) == 1
    assert "pgvector" in captured[0].query


# ─── per-question failure capture ─────────────────────────────


def test_research_one_returns_error_on_zero_hits() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_finding_payload()))
    result = research_one(_question(), router=_router(p), search=_search(hits=[]))
    assert isinstance(result, ResearchError)
    assert result.question_id == "RQ-01"
    assert "no search hits" in result.reason


def test_research_one_returns_error_after_two_validation_failures() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: "definitely not json")
    result = research_one(_question(), router=_router(p), search=_search())
    assert isinstance(result, ResearchError)
    assert result.question_id == "RQ-01"
    assert "validation failed twice" in result.reason


def test_research_one_returns_error_when_model_changes_question_id() -> None:
    """Schema would accept any RQ-NN id; we enforce the input id matches."""
    bad = _good_finding_payload("RQ-99")
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(bad))
    result = research_one(_question("RQ-01"), router=_router(p), search=_search())
    assert isinstance(result, ResearchError)


def test_research_one_retries_then_succeeds() -> None:
    responses = iter(["not json", json.dumps(_good_finding_payload())])
    p = MockLlmProvider(responder=lambda _msgs, _tier: next(responses))
    result = research_one(_question(), router=_router(p), search=_search())
    assert isinstance(result, ResearchFinding)


# ─── search-layer fallback ────────────────────────────────────


def test_search_client_falls_back_on_transient() -> None:
    failing = MockSearchProvider(fail_n_times=1)
    healthy = MockSearchProvider(canned=_hits())
    client = SearchClient([failing, healthy])
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_finding_payload()))
    result = research_one(_question(), router=_router(p), search=client)
    assert isinstance(result, ResearchFinding)


# ─── budget propagation ──────────────────────────────────────


def test_research_one_propagates_budget_exceeded() -> None:
    p = MockLlmProvider(responder=lambda _msgs, _tier: json.dumps(_good_finding_payload()))
    tiny = LlmRouter([p], BudgetTracker(cap_usd=0.0001, cap_tokens=100_000))
    with pytest.raises(BudgetExceeded):
        research_one(_question(), router=tiny, search=_search())


# ─── fan-out ─────────────────────────────────────────────────


def _plan(n: int) -> ResearchPlan:
    return ResearchPlan(
        questions=[
            ResearchQuestion(
                id=f"RQ-{i:02d}",
                question=f"Question number {i} about something architectural.",
                rationale="Wrong answer would change the architecture shape materially.",
                category="component_choice",
                priority="medium",
                keywords=[f"topic-{i}", "design"],
                relates_to=[],
            )
            for i in range(1, n + 1)
        ]
    )


def test_research_all_returns_one_finding_per_question() -> None:
    plan = _plan(4)

    def responder(msgs, _tier):
        # The user prompt embeds the question json; pull the id back out
        # so the finding's id matches.
        user_text = msgs[-1].content
        # crude: find the first "RQ-NN" in the prompt
        import re

        m = re.search(r"RQ-\d{1,3}", user_text)
        assert m is not None
        return json.dumps(_good_finding_payload(m.group(0)))

    p = MockLlmProvider(responder=responder)
    router = LlmRouter([p], BudgetTracker(cap_usd=5.0, cap_tokens=500_000))
    findings = asyncio.run(research_all(plan, router=router, search=_search(), concurrency=2))
    assert len(findings.findings) == 4
    assert len(findings.errors) == 0
    assert {f.question_id for f in findings.findings} == {"RQ-01", "RQ-02", "RQ-03", "RQ-04"}


def test_research_all_captures_per_question_errors_without_failing_run() -> None:
    """Two questions fail (one no-hits, one bad LLM output); two succeed."""
    plan = _plan(4)

    def responder(msgs, _tier):
        import re

        m = re.search(r"RQ-\d{1,3}", msgs[-1].content)
        assert m is not None
        qid = m.group(0)
        if qid == "RQ-02":
            return "garbage"  # LLM validation will fail twice
        return json.dumps(_good_finding_payload(qid))

    # Search provider returns no hits for RQ-03 only.
    def search_responder(query: SearchQuery) -> list[SearchHit]:
        if "topic-3" in query.query:
            return []
        return _hits()

    p = MockLlmProvider(responder=responder)
    router = LlmRouter([p], BudgetTracker(cap_usd=5.0, cap_tokens=500_000))
    sp = MockSearchProvider(responder=search_responder)
    findings = asyncio.run(
        research_all(plan, router=router, search=SearchClient([sp]), concurrency=2)
    )
    assert len(findings.findings) == 2
    assert len(findings.errors) == 2
    assert {e.question_id for e in findings.errors} == {"RQ-02", "RQ-03"}


def test_research_all_respects_concurrency_cap() -> None:
    """With concurrency=1 a 3-question plan must run serially. We assert
    the LLM saw a strictly serial call pattern (no two calls overlapping)."""
    plan = _plan(3)
    in_flight: list[int] = [0]
    max_in_flight: list[int] = [0]
    lock = asyncio.Lock()  # async lock for thread-pool safety not needed; use list-of-bool

    def responder(msgs, _tier):
        in_flight[0] += 1
        max_in_flight[0] = max(max_in_flight[0], in_flight[0])
        # Tiny sleep widens any concurrency window
        time.sleep(0.02)
        in_flight[0] -= 1
        import re

        m = re.search(r"RQ-\d{1,3}", msgs[-1].content)
        assert m is not None
        return json.dumps(_good_finding_payload(m.group(0)))

    p = MockLlmProvider(responder=responder)
    router = LlmRouter([p], BudgetTracker(cap_usd=5.0, cap_tokens=500_000))
    findings = asyncio.run(research_all(plan, router=router, search=_search(), concurrency=1))
    assert len(findings.findings) == 3
    assert max_in_flight[0] == 1, "concurrency=1 must serialize calls"
    # Suppress unused-import warning on lock (kept for clarity; no contention here).
    del lock


# ─── prompt template plumbing ─────────────────────────────────


def test_split_system_user_substitutes_placeholders() -> None:
    template = "## System\nYou are TESSAR.\n\n## User\nQ: {{QUESTION_JSON}}\nC: {{CITATIONS_JSON}}"
    msgs = _split_system_user(
        template,
        question_json='{"id":"RQ-01"}',
        citations_json="[]",
    )
    assert len(msgs) == 2
    assert msgs[0].role == "system"
    assert "TESSAR" in msgs[0].content
    assert '"id":"RQ-01"' in msgs[1].content
    assert "C: []" in msgs[1].content
