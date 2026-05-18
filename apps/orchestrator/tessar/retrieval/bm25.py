"""In-house Okapi BM25 implementation.

Pure numpy, ~50 lines. No `rank-bm25` dependency per ADR-0017 — the
algorithm is short enough to maintain inline and our KB vocabulary is
small (technical identifiers) so we want zero magic.

Parameters: k1=1.5, b=0.75 (literature defaults; tune via eval if
needed). Tokenisation: lowercase + non-alphanumeric → space, no
stemming (stemming hurts on names like `kubernetes-engine`).

Usage:
    idx = BM25Index(documents=["text of doc 1", "text of doc 2", ...])
    scores = idx.score("query string")   # numpy array, length = n_docs
    ranking = idx.rank("query string", top_k=20)  # [(doc_idx, score), ...]
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Sequence

import numpy as np

_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase + alphanumeric word split. Stable + cheap."""
    return [m.group(0).lower() for m in _TOKEN_RE.finditer(text or "")]


class BM25Index:
    """Okapi BM25 over a fixed corpus.

    Builds inverted statistics at construction time. `score(query)` is
    O(unique_query_tokens × n_docs_containing_token) which is sub-ms
    for our ~300-record KB.
    """

    def __init__(
        self,
        documents: Sequence[str],
        *,
        k1: float = 1.5,
        b: float = 0.75,
    ) -> None:
        self._k1 = k1
        self._b = b
        self._n_docs = len(documents)

        # Tokenise once.
        self._doc_tokens: list[list[str]] = [tokenize(d) for d in documents]
        self._doc_lens = np.asarray([len(t) for t in self._doc_tokens], dtype=np.float32)
        self._avgdl = float(self._doc_lens.mean()) if self._n_docs > 0 else 0.0

        # term -> sorted list of (doc_idx, tf)
        self._postings: dict[str, list[tuple[int, int]]] = {}
        # term -> idf
        self._idf: dict[str, float] = {}

        df: Counter[str] = Counter()
        for doc_idx, tokens in enumerate(self._doc_tokens):
            tf = Counter(tokens)
            for term, freq in tf.items():
                self._postings.setdefault(term, []).append((doc_idx, freq))
            for term in tf:
                df[term] += 1

        # IDF with the classic BM25 smoothing (Robertson/Sparck Jones).
        # Stays non-negative for n_docs >= 2; we floor at 0 just in case
        # of pathological single-doc corpora.
        for term, n_t in df.items():
            num = self._n_docs - n_t + 0.5
            den = n_t + 0.5
            self._idf[term] = max(0.0, math.log(1.0 + num / den))

    def score(self, query: str) -> np.ndarray:
        """Per-document BM25 score, shape (n_docs,). Zeros where no
        query term appears in the document."""
        scores = np.zeros(self._n_docs, dtype=np.float32)
        if self._n_docs == 0 or self._avgdl == 0.0:
            return scores

        q_tokens = tokenize(query)
        if not q_tokens:
            return scores

        # Deduplicate query terms; multiple occurrences of the same term
        # in the query don't change BM25 ranking (classic formulation).
        for term in set(q_tokens):
            idf = self._idf.get(term)
            if not idf:
                continue
            postings = self._postings.get(term)
            if not postings:
                continue
            for doc_idx, tf in postings:
                dl = float(self._doc_lens[doc_idx])
                denom = tf + self._k1 * (1.0 - self._b + self._b * dl / self._avgdl)
                if denom == 0.0:
                    continue
                scores[doc_idx] += idf * tf * (self._k1 + 1.0) / denom

        return scores

    def rank(self, query: str, *, top_k: int = 20) -> list[tuple[int, float]]:
        """Return `[(doc_idx, score), ...]` sorted descending by score,
        truncated to `top_k`. Skips documents with zero score."""
        scores = self.score(query)
        if scores.size == 0:
            return []
        # `argsort` is ascending; take a slice from the tail. Faster than
        # sorting the whole array for small top_k, but the corpus is tiny
        # so we just sort.
        order = np.argsort(-scores, kind="stable")
        out: list[tuple[int, float]] = []
        for idx in order[:top_k]:
            s = float(scores[idx])
            if s <= 0.0:
                break  # all subsequent are also zero
            out.append((int(idx), s))
        return out
