"""Vertex AI text-embedding-005 client + a deterministic mock for tests.

Per ADR-0017 + architecture.instructions.md, KB records and per-run
retrieval queries are embedded with `text-embedding-005` (1536-dim).
This module provides the adapter layer so retrieval code never imports
the Vertex SDK directly.

Two concrete implementations:
  - `VertexEmbedder` — real Vertex AI. Lazy-imported; raises a friendly
    error if `vertexai` is not installed.
  - `MockEmbedder` — deterministic pseudo-embeddings keyed off a sha256
    of the input text. Used in unit tests + the dev/CI factory path so
    nothing in the retrieval pipeline requires cloud creds to run.

Factory entry point: `build_embedder()` mirrors `llm/factory.py`. When
`VERTEX_PROJECT` is set, returns a `VertexEmbedder`; otherwise returns
`MockEmbedder` and logs loudly.
"""

from __future__ import annotations

import hashlib
import logging
from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any

import numpy as np

log = logging.getLogger(__name__)


EMBEDDING_DIM = 1536  # Locked by `kb_components.embedding Vector(1536)` column.


class Embedder(ABC):
    """Adapter for a text-embedding model."""

    name: str
    dim: int

    @abstractmethod
    def embed(self, texts: Sequence[str]) -> np.ndarray:
        """Embed a batch of strings. Returns a `(len(texts), self.dim)`
        float32 numpy array. Each row is L2-normalised so cosine
        similarity reduces to a single dot product."""


# ─── Mock embedder (CI / dev / unit tests) ───────────────────────


def _hash_to_unit_vector(text: str, dim: int) -> np.ndarray:
    """Deterministic pseudo-embedding: seed numpy RNG from sha256 of the
    text, draw `dim` floats from N(0,1), L2-normalise. Same text always
    yields the same vector — tests can assert exact identity."""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    # Use the first 8 bytes as a uint64 seed; numpy accepts that for
    # `default_rng`.
    seed = int.from_bytes(h[:8], "big", signed=False)
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(dim, dtype=np.float32)
    norm = float(np.linalg.norm(vec))
    if norm == 0.0:
        return vec
    return vec / norm


class MockEmbedder(Embedder):
    """Deterministic embedder for tests + dev runs. Embedding is a
    hash-seeded random unit vector; semantically meaningless but stable
    so BM25+vector RRF can be exercised end-to-end."""

    name = "mock_embedder"

    def __init__(self, dim: int = EMBEDDING_DIM) -> None:
        self.dim = dim

    def embed(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        return np.stack(
            [_hash_to_unit_vector(t, self.dim) for t in texts],
            axis=0,
        )


# ─── Vertex AI embedder (production path) ────────────────────────


_VERTEX_MODEL_ID = "text-embedding-005"


def _lazy_import_vertex() -> Any:
    """Import the Vertex SDK on first use. Friendly error if missing."""
    try:
        import vertexai  # type: ignore[import-not-found]
        from vertexai.language_models import (  # type: ignore[import-not-found]
            TextEmbeddingInput,
            TextEmbeddingModel,
        )
    except ImportError as e:
        raise RuntimeError(
            "VertexEmbedder requires `google-cloud-aiplatform` + `vertexai` "
            "installed. Add to apps/orchestrator/pyproject.toml — see "
            "ADR-0017."
        ) from e
    return vertexai, TextEmbeddingModel, TextEmbeddingInput


# Embedding-API transient errors (same name-based discrimination as the
# Vertex Gemini provider — keeps SDK out of the import surface).
_TRANSIENT_NAMES = {
    "ServiceUnavailable",
    "DeadlineExceeded",
    "ResourceExhausted",
    "InternalServerError",
    "Aborted",
    "Unavailable",
    "GoogleAPICallError",
}


class EmbedderTransientError(RuntimeError):
    """Embedder failure the caller should retry / fall back on."""


class VertexEmbedder(Embedder):
    """Vertex AI `text-embedding-005` adapter.

    Construct with `(project=..., location="asia-south1")`. ADC auth via
    google-auth — same surface as the Vertex Gemini provider.

    `task_type="RETRIEVAL_DOCUMENT"` for KB indexing; for the per-run
    query embedding the retriever passes `task_type="RETRIEVAL_QUERY"`
    via the `task_type` constructor arg. We default to QUERY because
    most calls in the hot path are query-side; document-side embedding
    happens once at startup.
    """

    name = "vertex_embedder"

    def __init__(
        self,
        *,
        project: str,
        location: str = "asia-south1",
        model_id: str = _VERTEX_MODEL_ID,
        task_type: str = "RETRIEVAL_QUERY",
        dim: int = EMBEDDING_DIM,
        batch_size: int = 100,
    ) -> None:
        self._project = project
        self._location = location
        self._model_id = model_id
        self._task_type = task_type
        self.dim = dim
        self._batch_size = batch_size
        self._initialised = False
        self._model: Any = None

    def _ensure_model(self) -> tuple[Any, Any]:
        if not self._initialised:
            vertexai, TextEmbeddingModel, TextEmbeddingInput = _lazy_import_vertex()
            vertexai.init(project=self._project, location=self._location)
            self._model = TextEmbeddingModel.from_pretrained(self._model_id)
            self._initialised = True
            return self._model, TextEmbeddingInput
        # Re-import the input type each call (cheap, cached by Python)
        _, _, TextEmbeddingInput = _lazy_import_vertex()
        return self._model, TextEmbeddingInput

    def embed(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        model, TextEmbeddingInput = self._ensure_model()

        # Vertex's API supports batching; chunk to `self._batch_size` to
        # stay under per-request limits.
        out_rows: list[np.ndarray] = []
        for start in range(0, len(texts), self._batch_size):
            chunk = list(texts[start : start + self._batch_size])
            inputs = [TextEmbeddingInput(text=t, task_type=self._task_type) for t in chunk]
            try:
                results = model.get_embeddings(inputs)
            except Exception as e:
                if type(e).__name__ in _TRANSIENT_NAMES:
                    raise EmbedderTransientError(f"vertex_embedder: {type(e).__name__}: {e}") from e
                raise
            for r in results:
                v = np.asarray(r.values, dtype=np.float32)
                norm = float(np.linalg.norm(v))
                if norm > 0.0:
                    v = v / norm
                out_rows.append(v)

        return np.stack(out_rows, axis=0)


# ─── Factory ─────────────────────────────────────────────────────


def build_embedder() -> Embedder:
    """Return the embedder the orchestrator should use this process.

    Prefers `VertexEmbedder` when `VERTEX_PROJECT` is set; falls back to
    `MockEmbedder` so dev / CI run without cloud creds. Logs loudly on
    fallback so production can't silently ship mock embeddings.
    """
    from tessar.config import settings

    if settings.vertex_project:
        try:
            return VertexEmbedder(
                project=settings.vertex_project,
                location=settings.vertex_location,
            )
        except Exception as e:  # SDK missing, auth failure
            log.warning("embedder.vertex_unavailable err=%s — falling back to mock", e)

    log.warning("embedder.using_mock — no Vertex project configured")
    return MockEmbedder()
