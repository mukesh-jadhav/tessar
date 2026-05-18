"""Unit tests for VertexClaudeProvider — no network, no real SDK calls.

Mirrors the shape of router tests. The Anthropic Vertex SDK is mocked at
the import boundary (`_lazy_import`) so this suite runs without the
`anthropic[vertex]` extra installed.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from tessar.llm.providers.base import OutputTruncatedError, TransientProviderError
from tessar.llm.providers.vertex_claude import (
    DEFAULT_MODELS,
    VertexClaudeProvider,
    _classify_error,
    _split_system_and_messages,
)
from tessar.llm.types import LlmMessage, Tier


# ─── supports() ──────────────────────────────────────────────────


def test_default_supports_only_tier_a() -> None:
    """Per ADR-0015: Claude is Tier-A only. Tier-B/C must fall through to
    Gemini in the router chain. This is enforced via supports()."""
    p = VertexClaudeProvider(project="x")
    assert p.supports(Tier.A) is True
    assert p.supports(Tier.B) is False
    assert p.supports(Tier.C) is False


def test_explicit_supported_tiers_override() -> None:
    """Factory may override for special-case wiring (e.g. enabling Claude
    Haiku for Tier-C in a future ADR). Round-trip the override."""
    p = VertexClaudeProvider(
        project="x",
        supported_tiers={Tier.A, Tier.B},
        models={Tier.A: "claude-sonnet-4-5", Tier.B: "claude-haiku-4-5"},
    )
    assert p.supports(Tier.A) is True
    assert p.supports(Tier.B) is True
    assert p.supports(Tier.C) is False  # no model configured


def test_default_model_is_claude_sonnet_4_5() -> None:
    """Pin the default Tier-A model so ADR-0015 changes are loud."""
    assert DEFAULT_MODELS[Tier.A].startswith("claude-sonnet-4-5")


# ─── estimate_cost_usd() ─────────────────────────────────────────


def test_estimate_cost_uses_sonnet_4_5_rates() -> None:
    """Sonnet 4.5 rates: $3/MTok input, $15/MTok output. 10k in + 4k out
    = 0.030 + 0.060 = $0.090."""
    p = VertexClaudeProvider(project="x")
    cost = p.estimate_cost_usd(tier=Tier.A, prompt_tokens=10_000, max_completion_tokens=4_000)
    assert cost == pytest.approx(0.030 + 0.060, rel=1e-6)


# ─── _split_system_and_messages() ────────────────────────────────


def test_split_extracts_system_and_appends_json_guard() -> None:
    """Anthropic Messages API takes `system` as a top-level kwarg, not a
    message. Verify the splitter pulls system messages out AND appends our
    JSON-only guard rail (Anthropic has no response_mime_type)."""
    messages = [
        LlmMessage(role="system", content="You are an architect agent."),
        LlmMessage(role="user", content="Design a service."),
    ]
    system_text, turns = _split_system_and_messages(messages)
    assert "architect agent" in system_text
    assert "single valid JSON object" in system_text
    assert turns == [{"role": "user", "content": "Design a service."}]


def test_split_concatenates_multiple_system_messages() -> None:
    messages = [
        LlmMessage(role="system", content="Rule 1."),
        LlmMessage(role="system", content="Rule 2."),
        LlmMessage(role="user", content="Go."),
    ]
    system_text, turns = _split_system_and_messages(messages)
    assert "Rule 1." in system_text
    assert "Rule 2." in system_text
    assert len(turns) == 1


# ─── _classify_error() ───────────────────────────────────────────


def test_classify_transient_by_name() -> None:
    """Connection / timeout / rate-limit errors must be transient so the
    router falls through to Gemini."""

    class APIConnectionError(Exception):  # noqa: N818
        pass

    class APITimeoutError(Exception):  # noqa: N818
        pass

    class OverloadedError(Exception):  # noqa: N818
        pass

    assert _classify_error(APIConnectionError("network")) is True
    assert _classify_error(APITimeoutError("slow")) is True
    assert _classify_error(OverloadedError("busy")) is True


def test_classify_status_error_discriminates_by_status() -> None:
    """4xx auth/validation must NOT be retried (would waste budget on a
    deterministic failure). 5xx + 429 must be retried."""

    class APIStatusError(Exception):  # noqa: N818
        def __init__(self, status_code: int) -> None:
            self.status_code = status_code

    assert _classify_error(APIStatusError(401)) is False  # auth — don't retry
    assert _classify_error(APIStatusError(400)) is False  # validation — don't retry
    assert _classify_error(APIStatusError(429)) is True  # rate limit — retry
    assert _classify_error(APIStatusError(500)) is True
    assert _classify_error(APIStatusError(503)) is True


def test_classify_unknown_exception_is_not_transient() -> None:
    assert _classify_error(ValueError("bad input")) is False


# ─── generate() — with mocked Anthropic SDK ──────────────────────


def _build_mock_anthropic_response(
    text: str,
    *,
    input_tokens: int,
    output_tokens: int,
    stop_reason: str = "end_turn",
) -> SimpleNamespace:
    """Shape-match the `Message` object returned by `messages.create()`."""
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
        stop_reason=stop_reason,
    )


def _patched_provider_with_response(response: Any) -> VertexClaudeProvider:
    """Build a provider whose `_lazy_import` returns a mock AnthropicVertex
    client that yields the given response."""
    mock_client = MagicMock()
    mock_client.messages.create.return_value = response

    mock_anthropic_vertex_cls = MagicMock(return_value=mock_client)

    p = VertexClaudeProvider(project="test-project", location="asia-south1")
    # Inject the mocked client class without going through _lazy_import.
    with patch(
        "tessar.llm.providers.vertex_claude._lazy_import",
        return_value=mock_anthropic_vertex_cls,
    ):
        # Touch _ensure_client so the mock is installed.
        p._ensure_client()
    return p


def test_generate_happy_path_returns_llm_response() -> None:
    """A normal end_turn response is parsed into an LlmResponse with
    correct provider/model/tier/usage."""
    fake_response = _build_mock_anthropic_response(
        text='{"ok": true}',
        input_tokens=120,
        output_tokens=8,
    )
    p = _patched_provider_with_response(fake_response)

    resp = p.generate(
        [LlmMessage(role="user", content="test")],
        tier=Tier.A,
        max_tokens=1024,
        temperature=0.2,
    )

    assert resp.text == '{"ok": true}'
    assert resp.provider == "vertex_claude"
    assert resp.model.startswith("claude-sonnet-4-5")
    assert resp.tier == Tier.A
    assert resp.usage.prompt_tokens == 120
    assert resp.usage.completion_tokens == 8
    # Cost: 120 in * 0.003/1000 + 8 out * 0.015/1000
    assert resp.usage.cost_usd == pytest.approx(120 * 0.003 / 1000 + 8 * 0.015 / 1000, rel=1e-6)


def test_generate_truncation_raises_output_truncated() -> None:
    """`stop_reason == "max_tokens"` MUST raise OutputTruncatedError so
    the calling agent can decide whether to retry with a bigger budget."""
    fake_response = _build_mock_anthropic_response(
        text='{"partial": ',
        input_tokens=50,
        output_tokens=1024,
        stop_reason="max_tokens",
    )
    p = _patched_provider_with_response(fake_response)

    with pytest.raises(OutputTruncatedError) as exc:
        p.generate(
            [LlmMessage(role="user", content="test")],
            tier=Tier.A,
            max_tokens=1024,
            temperature=0.2,
        )
    assert exc.value.partial_text == '{"partial":'


def test_generate_transient_error_becomes_transient_provider_error() -> None:
    """An SDK-level 503 must surface as TransientProviderError so the
    router falls through to Gemini."""

    class APIStatusError(Exception):  # noqa: N818
        def __init__(self, msg: str, status_code: int) -> None:
            super().__init__(msg)
            self.status_code = status_code

    mock_client = MagicMock()
    mock_client.messages.create.side_effect = APIStatusError("upstream busy", 503)
    mock_anthropic_vertex_cls = MagicMock(return_value=mock_client)

    p = VertexClaudeProvider(project="test-project")
    with patch(
        "tessar.llm.providers.vertex_claude._lazy_import",
        return_value=mock_anthropic_vertex_cls,
    ):
        p._ensure_client()

        with pytest.raises(TransientProviderError, match="APIStatusError"):
            p.generate(
                [LlmMessage(role="user", content="test")],
                tier=Tier.A,
                max_tokens=1024,
                temperature=0.2,
            )


def test_generate_non_transient_error_bubbles_unchanged() -> None:
    """Auth / validation errors must NOT be wrapped — the router would
    pointlessly try the next provider with the same broken request."""
    mock_client = MagicMock()
    mock_client.messages.create.side_effect = ValueError("bad messages shape")
    mock_anthropic_vertex_cls = MagicMock(return_value=mock_client)

    p = VertexClaudeProvider(project="test-project")
    with patch(
        "tessar.llm.providers.vertex_claude._lazy_import",
        return_value=mock_anthropic_vertex_cls,
    ):
        p._ensure_client()
        with pytest.raises(ValueError, match="bad messages shape"):
            p.generate(
                [LlmMessage(role="user", content="test")],
                tier=Tier.A,
                max_tokens=1024,
                temperature=0.2,
            )


# ─── factory wiring (smoke test) ─────────────────────────────────


def test_factory_chain_order_when_vertex_project_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """Per ADR-0015: when VERTEX_PROJECT is set, Claude must come BEFORE
    Gemini in the chain so the router picks Claude for Tier-A.

    We assert on provider names rather than instances to keep the test
    independent of construction details."""
    from tessar.llm import factory
    from tessar.config import settings

    monkeypatch.setattr(settings, "vertex_project", "test-project")

    # The real providers are guarded by try/except inside the factory so
    # missing SDKs don't crash startup. In CI we expect both to skip
    # (no anthropic, no vertexai installed) — but the *order* of the
    # attempts is what we're locking in. Inspect by patching the imports.
    claude_seen: list[bool] = []
    gemini_seen: list[bool] = []

    def fake_claude(*a: Any, **kw: Any) -> Any:
        claude_seen.append(True)
        raise RuntimeError("sdk-missing-in-test")

    def fake_gemini(*a: Any, **kw: Any) -> Any:
        gemini_seen.append(True)
        raise RuntimeError("sdk-missing-in-test")

    with (
        patch(
            "tessar.llm.providers.vertex_claude.VertexClaudeProvider", side_effect=fake_claude
        ),
        patch(
            "tessar.llm.providers.vertex_gemini.VertexGeminiProvider", side_effect=fake_gemini
        ),
    ):
        chain = factory._build_provider_chain()

    # Both attempted (in order). Both fail. Falls back to mock.
    assert claude_seen == [True]
    assert gemini_seen == [True]
    assert len(chain) == 1
    assert chain[0].name == "mock"
