"""Per-run search-client builder.

Returns a `SearchClient` that walks providers in order and falls back on
`TransientSearchError`. Mirrors `tessar.llm.factory.build_router` —
keeping the two layers shaped the same way means the future Tavily +
Brave wiring is a single-file change to `factory.py` (no agent edits).

Until the network adapters land (separate ADR-gated slice), every run
gets a `MockSearchProvider` seeded with a one-row "no results" stub.
The mock is deterministic and free; agents never see `None` for
search results, so the synthesis prompt always has the same shape.
"""

from __future__ import annotations

from .base import SearchProvider
from .providers.mock import MockSearchProvider
from .types import SearchHit, SearchQuery, TransientSearchError


class SearchClient:
    """Walks providers in order; transient errors fall back to the next.

    Non-transient errors (programmer error, schema violations) bubble
    up unchanged — same contract as `LlmRouter`.
    """

    def __init__(self, providers: list[SearchProvider]) -> None:
        if not providers:
            raise ValueError("SearchClient needs at least one provider")
        self._providers = providers

    def search(self, query: SearchQuery) -> list[SearchHit]:
        last_error: Exception | None = None
        for provider in self._providers:
            try:
                return provider.search(query)
            except TransientSearchError as e:
                last_error = e
                continue
        # Every provider died with a transient error. Surface the last
        # one so the agent can decide to skip the question rather than
        # fail the whole run.
        assert last_error is not None
        raise last_error


def build_search_client() -> SearchClient:
    """Build the search client for the current process.

    MVP-stub: always returns a `MockSearchProvider` returning an empty
    result set. The real Tavily/Brave adapters will be wired here
    behind feature flags + an ADR.
    """
    return SearchClient([MockSearchProvider(canned=[])])
