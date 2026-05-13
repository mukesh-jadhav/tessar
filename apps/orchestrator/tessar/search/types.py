"""Web-search adapter types.

Mirrors the shape of `tessar.llm.types` — a thin Pydantic surface so
agents can depend on a stable interface while the real Tavily / Brave
adapters and Trafilatura+Playwright scraper land in a follow-up slice.

Adding a real network-touching adapter (`tavily-python`, `trafilatura`,
`playwright`) requires an ADR per `architecture.instructions.md`.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SearchQuery(BaseModel):
    """One search request issued by a research worker."""

    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=300)
    max_results: int = Field(default=5, ge=1, le=10)


class SearchHit(BaseModel):
    """One result row returned by a search provider.

    `content` is already-extracted readable text. The mock provider
    fills it directly; the real Tavily adapter will populate it from
    Tavily's `raw_content` field, falling back to a Trafilatura scrape
    of the URL when raw_content is empty.
    """

    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=4, max_length=2048)
    title: str = Field(min_length=1, max_length=300)
    snippet: str = Field(default="", max_length=2000)
    content: str = Field(default="", max_length=20_000)
    publisher: str | None = Field(default=None, max_length=200)
    published_at: datetime | None = None


class SearchError(RuntimeError):
    """Base class for adapter errors."""


class TransientSearchError(SearchError):
    """Retryable: timeout, 5xx, transient network. Caller may fall back
    to a sibling provider (mirrors `TransientProviderError` in the LLM
    layer)."""
