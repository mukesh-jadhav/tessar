"""Web-search adapter — public surface for agents.

Agents import ONLY from `tessar.search`; the concrete provider modules
under `tessar.search.providers.*` are an implementation detail.
"""

from .base import SearchProvider
from .factory import SearchClient, build_search_client
from .types import SearchError, SearchHit, SearchQuery, TransientSearchError

__all__ = [
    "SearchClient",
    "SearchError",
    "SearchHit",
    "SearchProvider",
    "SearchQuery",
    "TransientSearchError",
    "build_search_client",
]
