"""Search provider protocol."""

from __future__ import annotations

from typing import Protocol

from .types import SearchHit, SearchQuery


class SearchProvider(Protocol):
    """Anything that can answer a `SearchQuery` with a list of `SearchHit`s.

    Implementations: `MockSearchProvider` (hermetic, used in tests +
    dev-without-creds), and a future `TavilySearchProvider` /
    `BraveSearchProvider` (network-touching, ADR-gated).
    """

    name: str

    def search(self, query: SearchQuery) -> list[SearchHit]: ...
