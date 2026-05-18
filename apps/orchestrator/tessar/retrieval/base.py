"""Public types + protocol for KB retrievers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from pydantic import BaseModel, ConfigDict, Field

from tessar.kb.types import KbRecord


class RetrievalResult(BaseModel):
    """One ranked KB hit.

    `score` is the fused RRF score (higher = more relevant). `bm25_rank`
    and `vector_rank` are the per-arm ranks (1-indexed; `None` if the
    record was not in that arm's top-N list). Captured so the audit tab
    can show *why* a record was picked.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True, frozen=True)

    record: KbRecord
    score: float = Field(ge=0.0)
    bm25_rank: int | None = None
    vector_rank: int | None = None


class KbRetriever(ABC):
    """Adapter for a single retrieval strategy.

    Implementations: `HybridRetriever` (BM25 + vector + RRF). Future:
    `PostgresHybridRetriever` once KB scale > ~3000 records (ADR-0017
    migration trigger).
    """

    @abstractmethod
    def retrieve(self, query: str, *, top_k: int = 20) -> list[RetrievalResult]:
        """Return the top-K records ranked by relevance to `query`. Must
        never return more than `top_k`; may return fewer if the corpus
        is smaller. Deterministic for a given (corpus, query, top_k)."""


def records_to_results(records: Sequence[KbRecord]) -> list[RetrievalResult]:
    """Wrap a list of records as `RetrievalResult` with a flat score of
    1.0. Used by the graceful-degradation fallback when both retrieval
    arms have failed — keeps the runner's call shape consistent."""
    return [RetrievalResult(record=r, score=1.0) for r in records]
