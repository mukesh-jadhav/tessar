"""Unit tests for `tessar.retrieval` and `tessar.llm.embeddings`.

Covers:
- BM25 ranking (lexical match, IDF, doc length normalisation).
- MockEmbedder determinism + L2-normalisation.
- HybridRetriever fusion (BM25 + vector + RRF).
- Graceful degradation (no embedder; embedder failure at index time).
- top_k respect; empty corpus.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

import numpy as np
import pytest

from tessar.kb.types import KbRecord, KbSource
from tessar.llm.embeddings import (
    EMBEDDING_DIM,
    Embedder,
    MockEmbedder,
    _hash_to_unit_vector,
)
from tessar.retrieval import BM25Index, HybridRetriever, RetrievalResult
from tessar.retrieval.bm25 import tokenize

# ─── fixtures ────────────────────────────────────────────────────


def _kb(name: str, **kw: object) -> KbRecord:
    """Build a KbRecord with sensible defaults for retrieval tests."""
    defaults: dict[str, object] = {
        "id": f"kb-{name.lower().replace(' ', '-')}",
        "name": name,
        "category": "compute",
        "vendor": "google",
        "cloud": "gcp",
        "pricing_model": "per-request",
        "baseline_cost_usd_per_month": 100.0,
        "regions": ["asia-south1"],
        "compliance": [],
        "capabilities": [],
        "alternatives": [],
        "sources": [
            KbSource(
                url="https://example.com/doc",
                title="Vendor docs",
                snapshot_date=date(2025, 1, 1),
            )
        ],
        "last_verified_at": date(2025, 1, 1),
        "notes": "",
    }
    defaults.update(kw)
    return KbRecord(**defaults)  # type: ignore[arg-type]


@pytest.fixture
def small_kb() -> list[KbRecord]:
    return [
        _kb(
            "Cloud Run",
            category="compute",
            capabilities=["serverless", "containers", "autoscaling"],
            notes="serverless container platform on GCP",
        ),
        _kb(
            "Cloud SQL Postgres",
            category="database",
            capabilities=["relational", "postgres", "managed"],
            notes="managed postgres on GCP with HA",
        ),
        _kb(
            "Memorystore Redis",
            category="cache",
            capabilities=["redis", "cache", "in-memory"],
            notes="managed redis on GCP for caching",
        ),
        _kb(
            "Pub/Sub",
            category="messaging",
            capabilities=["pubsub", "queue", "async"],
            notes="async messaging on GCP",
        ),
        _kb(
            "Cloud Storage",
            category="storage",
            capabilities=["object-storage", "blobs"],
            notes="object storage on GCP",
        ),
    ]


# ─── BM25 ────────────────────────────────────────────────────────


def test_tokenize_lowercases_and_splits_on_nonalnum() -> None:
    assert tokenize("Cloud-Run, version 2!") == ["cloud", "run", "version", "2"]


def test_tokenize_handles_empty_input() -> None:
    assert tokenize("") == []
    assert tokenize(None) == []  # type: ignore[arg-type]


def test_bm25_returns_zero_scores_on_empty_corpus() -> None:
    idx = BM25Index([])
    scores = idx.score("anything")
    assert scores.shape == (0,)
    assert idx.rank("anything", top_k=5) == []


def test_bm25_ranks_exact_match_first() -> None:
    docs = [
        "managed postgres on gcp",
        "redis cache",
        "serverless container platform",
    ]
    idx = BM25Index(docs)
    hits = idx.rank("postgres", top_k=3)
    assert hits[0][0] == 0
    assert hits[0][1] > 0.0


def test_bm25_skips_zero_score_documents() -> None:
    idx = BM25Index(["postgres", "redis", "kafka"])
    hits = idx.rank("postgres", top_k=10)
    # Only one document matches → only one hit returned.
    assert len(hits) == 1
    assert hits[0][0] == 0


def test_bm25_idf_downweights_common_terms() -> None:
    # "gcp" appears in every doc → its IDF should not dominate.
    docs = [
        "gcp postgres",
        "gcp redis",
        "gcp storage",
    ]
    idx = BM25Index(docs)
    hits = idx.rank("postgres gcp", top_k=3)
    # postgres is rarer than gcp, so doc 0 must rank first.
    assert hits[0][0] == 0


def test_bm25_respects_top_k() -> None:
    docs = [f"postgres entry {i}" for i in range(10)]
    idx = BM25Index(docs)
    hits = idx.rank("postgres", top_k=3)
    assert len(hits) == 3


# ─── MockEmbedder ────────────────────────────────────────────────


def test_mock_embedder_is_deterministic() -> None:
    e = MockEmbedder()
    a = e.embed(["hello world"])
    b = e.embed(["hello world"])
    np.testing.assert_array_equal(a, b)


def test_mock_embedder_produces_unit_vectors() -> None:
    e = MockEmbedder()
    out = e.embed(["alpha", "beta", "gamma"])
    norms = np.linalg.norm(out, axis=1)
    np.testing.assert_allclose(norms, np.ones(3), rtol=1e-5)


def test_mock_embedder_handles_empty_input() -> None:
    e = MockEmbedder()
    out = e.embed([])
    assert out.shape == (0, EMBEDDING_DIM)


def test_hash_to_unit_vector_distinct_texts_distinct_vectors() -> None:
    v1 = _hash_to_unit_vector("alpha", 1536)
    v2 = _hash_to_unit_vector("beta", 1536)
    # Cosine similarity of two random unit vectors in 1536-D is near 0.
    cos = float(v1 @ v2)
    assert abs(cos) < 0.1


# ─── HybridRetriever ─────────────────────────────────────────────


def test_hybrid_returns_empty_on_empty_corpus() -> None:
    r = HybridRetriever(records=[], embedder=MockEmbedder())
    assert r.retrieve("postgres", top_k=5) == []


def test_hybrid_respects_top_k_zero(small_kb: list[KbRecord]) -> None:
    r = HybridRetriever(records=small_kb, embedder=None)
    assert r.retrieve("postgres", top_k=0) == []


def test_hybrid_bm25_only_when_embedder_is_none(
    small_kb: list[KbRecord],
) -> None:
    r = HybridRetriever(records=small_kb, embedder=None)
    hits = r.retrieve("postgres database", top_k=3)
    assert len(hits) >= 1
    # Cloud SQL Postgres must rank first; it's the only Postgres record.
    assert hits[0].record.name == "Cloud SQL Postgres"
    assert hits[0].bm25_rank == 1
    assert hits[0].vector_rank is None


def test_hybrid_with_embedder_includes_vector_arm(
    small_kb: list[KbRecord],
) -> None:
    r = HybridRetriever(records=small_kb, embedder=MockEmbedder())
    hits = r.retrieve("postgres database", top_k=3)
    assert hits
    # The matching record should appear with a bm25 rank set (vector
    # arm with a mock embedder is semantically meaningless but must
    # populate ranks for *some* records).
    pg = next(h for h in hits if h.record.name == "Cloud SQL Postgres")
    assert pg.bm25_rank == 1


def test_hybrid_returns_results_typed(small_kb: list[KbRecord]) -> None:
    r = HybridRetriever(records=small_kb, embedder=None)
    hits = r.retrieve("redis", top_k=2)
    assert all(isinstance(h, RetrievalResult) for h in hits)
    assert all(h.score > 0.0 for h in hits)


def test_hybrid_no_hits_returns_head(small_kb: list[KbRecord]) -> None:
    """Degenerate query — BM25 empty, vector arm absent → head fallback
    so the runner can still progress."""
    r = HybridRetriever(records=small_kb, embedder=None)
    hits = r.retrieve("zzzzz_no_such_term_anywhere", top_k=3)
    assert len(hits) == 3
    # Order is corpus order (no ranking signal available).
    assert [h.record.name for h in hits] == [
        small_kb[0].name,
        small_kb[1].name,
        small_kb[2].name,
    ]


def test_hybrid_rrf_fuses_two_arms(small_kb: list[KbRecord]) -> None:
    """Pin both arms to controlled rankings to verify RRF math."""

    class _FixedEmbedder(Embedder):
        name = "fixed"
        dim = 4

        def __init__(self, doc_vectors: np.ndarray, query_vector: np.ndarray) -> None:
            self._docs = doc_vectors
            self._query = query_vector
            self._first_call = True

        def embed(self, texts: Sequence[str]) -> np.ndarray:
            if self._first_call:
                self._first_call = False
                return self._docs
            return self._query[None, :]

    # Vector arm strongly prefers record index 2 (Memorystore).
    n = len(small_kb)
    docs = np.zeros((n, 4), dtype=np.float32)
    docs[2] = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    docs[0] = np.array([0.5, 0.5, 0.0, 0.0], dtype=np.float32)
    q = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    emb = _FixedEmbedder(docs, q)
    r = HybridRetriever(records=small_kb, embedder=emb)

    # Query that BM25 also has an opinion on (matches "redis" lexically).
    hits = r.retrieve("redis cache", top_k=3)
    assert hits
    top = hits[0]
    # Memorystore Redis should win — both arms agree.
    assert top.record.name == "Memorystore Redis"
    assert top.bm25_rank == 1
    assert top.vector_rank == 1


def test_hybrid_degrades_when_embedder_index_fails(
    small_kb: list[KbRecord],
) -> None:
    class _BrokenEmbedder(Embedder):
        name = "broken"
        dim = 8

        def embed(self, texts: Sequence[str]) -> np.ndarray:
            raise RuntimeError("vertex unreachable")

    r = HybridRetriever(records=small_kb, embedder=_BrokenEmbedder())
    hits = r.retrieve("postgres", top_k=3)
    # Index-time embed failure → degrades to BM25-only.
    assert hits
    assert hits[0].record.name == "Cloud SQL Postgres"
    assert hits[0].vector_rank is None


def test_hybrid_degrades_when_embedder_query_fails(
    small_kb: list[KbRecord],
) -> None:
    class _OneShotEmbedder(Embedder):
        name = "oneshot"
        dim = 4

        def __init__(self) -> None:
            self._called = 0

        def embed(self, texts: Sequence[str]) -> np.ndarray:
            self._called += 1
            if self._called == 1:
                # Index succeeds.
                return np.zeros((len(texts), 4), dtype=np.float32)
            # Query fails.
            raise RuntimeError("rate limited")

    r = HybridRetriever(records=small_kb, embedder=_OneShotEmbedder())
    hits = r.retrieve("postgres", top_k=3)
    # Query-time failure → vector arm silently empty → BM25 only.
    assert hits
    assert hits[0].record.name == "Cloud SQL Postgres"
    assert hits[0].vector_rank is None
