"""Hybrid retrieval = BM25 + vector cosine + Reciprocal Rank Fusion.

Per [ADR-0017](../../../docs/adr/0017-hybrid-kb-retrieval.md).

Graceful degradation:
  - Embedder failure -> log + fall back to BM25-only.
  - BM25 yields no hits -> use vector ranking alone.
  - Both arms empty -> return first `top_k` records (rare; logged).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence

import numpy as np

from tessar.kb.types import KbRecord
from tessar.llm.embeddings import Embedder, EmbedderTransientError

from .base import KbRetriever, RetrievalResult
from .bm25 import BM25Index

log = logging.getLogger(__name__)


# Cormack et al. (2009). Not tuned per query — that's RRF's design.
_RRF_K = 60


def _record_to_indexed_text(r: KbRecord) -> str:
    """Compose the indexed text per record. Mirrors ADR-0017 §3.

    Order matters only for human inspection; BM25 is bag-of-words.
    Capabilities + compliance get joined with spaces so each tag becomes
    its own token.
    """
    parts: list[str] = [r.name, r.category, r.vendor, r.cloud]
    if r.capabilities:
        parts.append(" ".join(r.capabilities))
    if r.compliance:
        parts.append(" ".join(r.compliance))
    if r.pricing_model:
        parts.append(r.pricing_model)
    if r.notes:
        parts.append(r.notes)
    return " ".join(p for p in parts if p)


class HybridRetriever(KbRetriever):
    """BM25 + vector cosine + RRF over an in-memory KB list.

    The corpus is fixed at construction (records loaded once per
    process). Document embeddings are computed eagerly so the per-query
    hot path is just (query embedding + dot product).

    If `embedder` is `None`, the retriever runs BM25-only — used in
    tests that don't care about semantic ranking, and as the degraded
    runtime fallback when Vertex is unreachable.
    """

    def __init__(
        self,
        *,
        records: Sequence[KbRecord],
        embedder: Embedder | None = None,
        rrf_k: int = _RRF_K,
    ) -> None:
        self._records: list[KbRecord] = list(records)
        self._embedder = embedder
        self._rrf_k = rrf_k

        # Pre-compute BM25 index. Cheap for ~300 records.
        self._indexed_texts: list[str] = [_record_to_indexed_text(r) for r in self._records]
        self._bm25 = BM25Index(self._indexed_texts)

        # Pre-compute doc embeddings (eager so the hot path is just the
        # query embedding + dot product). Failure on startup -> log +
        # degrade to BM25-only for the lifetime of this retriever.
        self._doc_embeddings: np.ndarray | None = None
        if embedder is not None and self._records:
            try:
                self._doc_embeddings = embedder.embed(self._indexed_texts)
                log.info(
                    "retrieval.embeddings_indexed n_records=%d embedder=%s dim=%d",
                    len(self._records),
                    embedder.name,
                    embedder.dim,
                )
            except (EmbedderTransientError, Exception) as e:
                log.warning(
                    "retrieval.embedder_index_failed err=%s — falling back to BM25-only",
                    e,
                )
                self._doc_embeddings = None
                self._embedder = None

    # ---- ranking arms ------------------------------------------------

    def _bm25_ranking(self, query: str, *, top_k: int) -> list[tuple[int, float]]:
        # Pull more than top_k so RRF has headroom to discover items
        # the vector arm also liked. 3x is plenty for our scale.
        return self._bm25.rank(query, top_k=top_k * 3)

    def _vector_ranking(self, query: str, *, top_k: int) -> list[tuple[int, float]]:
        if self._embedder is None or self._doc_embeddings is None:
            return []
        try:
            q_vec = self._embedder.embed([query])
        except (EmbedderTransientError, Exception) as e:
            log.warning("retrieval.embed_query_failed err=%s", e)
            return []
        if q_vec.shape[0] == 0:
            return []
        # Both q_vec and doc_embeddings are L2-normalised at embedding
        # time, so dot product == cosine similarity.
        sims = self._doc_embeddings @ q_vec[0]
        order = np.argsort(-sims, kind="stable")
        out: list[tuple[int, float]] = []
        for idx in order[: top_k * 3]:
            s = float(sims[idx])
            if s <= 0.0:
                break
            out.append((int(idx), s))
        return out

    # ---- RRF + public API -------------------------------------------

    def retrieve(self, query: str, *, top_k: int = 20) -> list[RetrievalResult]:
        if not self._records:
            return []
        if top_k <= 0:
            return []

        bm25_hits = self._bm25_ranking(query, top_k=top_k)
        vector_hits = self._vector_ranking(query, top_k=top_k)

        # Build rank maps (1-indexed; absent from a list = no contribution).
        bm25_rank: dict[int, int] = {idx: r + 1 for r, (idx, _) in enumerate(bm25_hits)}
        vector_rank: dict[int, int] = {idx: r + 1 for r, (idx, _) in enumerate(vector_hits)}

        if not bm25_rank and not vector_rank:
            # Both arms empty — degenerate query. Return the first
            # `top_k` records so the run still progresses; the eval
            # harness will flag the brief if this becomes common.
            log.warning(
                "retrieval.no_hits query_len=%d corpus=%d — returning head",
                len(query),
                len(self._records),
            )
            from .base import records_to_results

            return records_to_results(self._records[:top_k])

        # RRF fusion.
        candidates = set(bm25_rank) | set(vector_rank)
        fused: list[tuple[int, float]] = []
        for idx in candidates:
            score = 0.0
            if idx in bm25_rank:
                score += 1.0 / (self._rrf_k + bm25_rank[idx])
            if idx in vector_rank:
                score += 1.0 / (self._rrf_k + vector_rank[idx])
            fused.append((idx, score))

        fused.sort(key=lambda x: x[1], reverse=True)
        fused = fused[:top_k]

        return [
            RetrievalResult(
                record=self._records[idx],
                score=score,
                bm25_rank=bm25_rank.get(idx),
                vector_rank=vector_rank.get(idx),
            )
            for idx, score in fused
        ]
