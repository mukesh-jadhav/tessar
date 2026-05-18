"""Hybrid KB retrieval: BM25 + vector cosine + RRF.

Per [ADR-0017](../../../docs/adr/0017-hybrid-kb-retrieval.md). Public surface:

    from tessar.retrieval import HybridRetriever, RetrievalResult
    from tessar.llm.embeddings import build_embedder

    retriever = HybridRetriever(records=kb_records, embedder=build_embedder())
    results = retriever.retrieve("brief text + requirements", top_k=20)
    # results: list[RetrievalResult] (record + score + provenance)

In dev / CI without Vertex creds, `build_embedder()` returns a
deterministic `MockEmbedder` so this module is fully exercisable
without cloud access.
"""

from __future__ import annotations

from .base import KbRetriever, RetrievalResult
from .bm25 import BM25Index
from .hybrid import HybridRetriever

__all__ = ["BM25Index", "HybridRetriever", "KbRetriever", "RetrievalResult"]
