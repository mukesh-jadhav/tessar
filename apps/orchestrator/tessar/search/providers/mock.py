"""In-process mock search provider — used by unit tests and any dev box
without Tavily / Brave creds.

Two construction modes:
  - `responder`: a callable `(SearchQuery) -> list[SearchHit]` for full
    control inside tests.
  - `canned`: a fixed list of hits returned for every query (truncated
    to `max_results`); convenient when the test only cares that *some*
    citation flowed through.

Optional `fail_n_times`: raise `TransientSearchError` for the first N
calls, then succeed. Mirrors the LLM `MockLlmProvider` pattern so the
agent's transient-fallback path can be exercised hermetically.
"""

from __future__ import annotations

from collections.abc import Callable

from ..types import SearchHit, SearchQuery, TransientSearchError


class MockSearchProvider:
    name = "mock"

    def __init__(
        self,
        *,
        responder: Callable[[SearchQuery], list[SearchHit]] | None = None,
        canned: list[SearchHit] | None = None,
        fail_n_times: int = 0,
    ) -> None:
        if responder is None and canned is None:
            canned = []
        self._responder = responder
        self._canned = canned
        self._remaining_failures = fail_n_times
        self.calls: list[SearchQuery] = []

    def search(self, query: SearchQuery) -> list[SearchHit]:
        self.calls.append(query)
        if self._remaining_failures > 0:
            self._remaining_failures -= 1
            raise TransientSearchError(f"mock transient #{self._remaining_failures + 1}")
        if self._responder is not None:
            return self._responder(query)
        assert self._canned is not None
        return list(self._canned[: query.max_results])
