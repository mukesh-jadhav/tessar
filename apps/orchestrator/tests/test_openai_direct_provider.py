"""Unit tests for OpenAIDirectProvider — no network, no real SDK calls.

Mirrors `test_vertex_claude_provider.py`. The OpenAI SDK is mocked at
the import boundary (`_lazy_import`) so this suite runs without the
`openai` package installed.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from tessar.llm.providers.base import OutputTruncatedError, TransientProviderError
from tessar.llm.providers.openai_direct import (
    DEFAULT_MODELS,
    OpenAIDirectProvider,
    _classify_error,
    _to_openai_messages,
)
from tessar.llm.types import LlmMessage, Tier

# ─── supports() ──────────────────────────────────────────────────


def test_default_supports_all_tiers() -> None:
    """OpenAI is the last-resort fallback for the entire chain — must
    serve every tier unless explicitly narrowed."""
    p = OpenAIDirectProvider(api_key="sk-test")
    assert p.supports(Tier.A) is True
    assert p.supports(Tier.B) is True
    assert p.supports(Tier.C) is True


def test_explicit_supported_tiers_override() -> None:
    p = OpenAIDirectProvider(api_key="sk-test", supported_tiers={Tier.A})
    assert p.supports(Tier.A) is True
    assert p.supports(Tier.B) is False
    assert p.supports(Tier.C) is False


def test_default_models_are_gpt5_family() -> None:
    """Pin default model IDs so ADR-0015 changes are loud."""
    assert DEFAULT_MODELS[Tier.A] == "gpt-5"
    assert DEFAULT_MODELS[Tier.B] == "gpt-5-mini"
    assert DEFAULT_MODELS[Tier.C] == "gpt-5-nano"


# ─── estimate_cost_usd() ─────────────────────────────────────────


def test_estimate_cost_uses_gpt5_rates() -> None:
    """gpt-5: $1.25/MTok input, $10/MTok output. 10k in + 4k out
    = 0.0125 + 0.040 = $0.0525."""
    p = OpenAIDirectProvider(api_key="sk-test")
    cost = p.estimate_cost_usd(tier=Tier.A, prompt_tokens=10_000, max_completion_tokens=4_000)
    assert cost == pytest.approx(0.0125 + 0.040, rel=1e-6)


def test_estimate_cost_tier_b_uses_mini_rates() -> None:
    p = OpenAIDirectProvider(api_key="sk-test")
    cost = p.estimate_cost_usd(tier=Tier.B, prompt_tokens=10_000, max_completion_tokens=4_000)
    # gpt-5-mini: $0.15/MTok in, $0.60/MTok out → 0.0015 + 0.0024 = 0.0039
    assert cost == pytest.approx(0.0015 + 0.0024, rel=1e-6)


# ─── _to_openai_messages() ───────────────────────────────────────


def test_to_openai_messages_roundtrips_roles() -> None:
    """OpenAI Chat Completions uses the same role taxonomy as our wire
    type — system / user / assistant — so the mapping is 1:1."""
    messages = [
        LlmMessage(role="system", content="be terse"),
        LlmMessage(role="user", content="hello"),
        LlmMessage(role="assistant", content="hi"),
    ]
    out = _to_openai_messages(messages)
    assert out == [
        {"role": "system", "content": "be terse"},
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]


# ─── _classify_error() ───────────────────────────────────────────


def test_classify_transient_by_name() -> None:
    class APIConnectionError(Exception):
        pass

    class RateLimitError(Exception):
        pass

    class APITimeoutError(Exception):
        pass

    assert _classify_error(APIConnectionError("network")) is True
    assert _classify_error(RateLimitError("slow down")) is True
    assert _classify_error(APITimeoutError("slow")) is True


def test_classify_status_error_discriminates_by_status() -> None:
    """4xx auth/validation must NOT be retried. 5xx + 429 must be."""

    class APIStatusError(Exception):
        def __init__(self, status_code: int) -> None:
            self.status_code = status_code

    assert _classify_error(APIStatusError(401)) is False
    assert _classify_error(APIStatusError(400)) is False
    assert _classify_error(APIStatusError(429)) is True
    assert _classify_error(APIStatusError(500)) is True
    assert _classify_error(APIStatusError(503)) is True


def test_classify_unknown_exception_is_not_transient() -> None:
    assert _classify_error(ValueError("bad input")) is False


# ─── generate() — with mocked OpenAI SDK ─────────────────────────


def _build_mock_openai_response(
    text: str,
    *,
    prompt_tokens: int,
    completion_tokens: int,
    finish_reason: str = "stop",
) -> SimpleNamespace:
    """Shape-match the `ChatCompletion` object returned by
    `chat.completions.create()`."""
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=text),
                finish_reason=finish_reason,
            )
        ],
        usage=SimpleNamespace(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        ),
    )


def _patched_provider_with_response(response: Any) -> OpenAIDirectProvider:
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = response

    mock_openai_cls = MagicMock(return_value=mock_client)

    p = OpenAIDirectProvider(api_key="sk-test")
    with patch(
        "tessar.llm.providers.openai_direct._lazy_import",
        return_value=mock_openai_cls,
    ):
        p._ensure_client()
    return p


def test_generate_happy_path_returns_llm_response() -> None:
    fake_response = _build_mock_openai_response(
        text='{"ok": true}',
        prompt_tokens=120,
        completion_tokens=8,
    )
    p = _patched_provider_with_response(fake_response)

    resp = p.generate(
        [LlmMessage(role="user", content="test")],
        tier=Tier.A,
        max_tokens=1024,
        temperature=0.2,
    )

    assert resp.text == '{"ok": true}'
    assert resp.provider == "openai_direct"
    assert resp.model == "gpt-5"
    assert resp.tier == Tier.A
    assert resp.usage.prompt_tokens == 120
    assert resp.usage.completion_tokens == 8
    # gpt-5: 120 * 0.00125/1000 + 8 * 0.010/1000
    assert resp.usage.cost_usd == pytest.approx(120 * 0.00125 / 1000 + 8 * 0.010 / 1000, rel=1e-6)


def test_generate_passes_json_response_format() -> None:
    """Every TESSAR agent emits strict JSON — ensure we always pass
    response_format={"type": "json_object"} so OpenAI cannot wrap in fences."""
    fake_response = _build_mock_openai_response(
        text='{"ok": 1}', prompt_tokens=1, completion_tokens=1
    )
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = fake_response
    mock_openai_cls = MagicMock(return_value=mock_client)

    p = OpenAIDirectProvider(api_key="sk-test")
    with patch(
        "tessar.llm.providers.openai_direct._lazy_import",
        return_value=mock_openai_cls,
    ):
        p.generate(
            [LlmMessage(role="user", content="x")],
            tier=Tier.B,
            max_tokens=100,
            temperature=0.0,
        )

    kwargs = mock_client.chat.completions.create.call_args.kwargs
    assert kwargs["response_format"] == {"type": "json_object"}
    assert kwargs["model"] == "gpt-5-mini"
    assert kwargs["max_tokens"] == 100
    assert kwargs["temperature"] == 0.0


def test_generate_truncation_raises_output_truncated() -> None:
    fake_response = _build_mock_openai_response(
        text='{"partial":',
        prompt_tokens=50,
        completion_tokens=1024,
        finish_reason="length",
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
    class RateLimitError(Exception):
        pass

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RateLimitError("slow down")
    mock_openai_cls = MagicMock(return_value=mock_client)

    p = OpenAIDirectProvider(api_key="sk-test")
    with patch(
        "tessar.llm.providers.openai_direct._lazy_import",
        return_value=mock_openai_cls,
    ):
        p._ensure_client()

        with pytest.raises(TransientProviderError, match="RateLimitError"):
            p.generate(
                [LlmMessage(role="user", content="test")],
                tier=Tier.A,
                max_tokens=1024,
                temperature=0.2,
            )


def test_generate_non_transient_error_bubbles_unchanged() -> None:
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = ValueError("bad messages shape")
    mock_openai_cls = MagicMock(return_value=mock_client)

    p = OpenAIDirectProvider(api_key="sk-test")
    with patch(
        "tessar.llm.providers.openai_direct._lazy_import",
        return_value=mock_openai_cls,
    ):
        p._ensure_client()
        with pytest.raises(ValueError, match="bad messages shape"):
            p.generate(
                [LlmMessage(role="user", content="test")],
                tier=Tier.A,
                max_tokens=1024,
                temperature=0.2,
            )


def test_generate_empty_choices_raises_transient() -> None:
    """OpenAI sometimes returns an empty choices array on transient
    upstream issues — treat as transient so the chain can recover."""
    fake_response = SimpleNamespace(
        choices=[],
        usage=SimpleNamespace(prompt_tokens=0, completion_tokens=0),
    )
    p = _patched_provider_with_response(fake_response)

    with pytest.raises(TransientProviderError, match="no choices"):
        p.generate(
            [LlmMessage(role="user", content="test")],
            tier=Tier.A,
            max_tokens=1024,
            temperature=0.2,
        )


# ─── factory wiring (smoke test) ─────────────────────────────────


def test_factory_wires_openai_when_key_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """Per ADR-0015: when OPENAI_API_KEY is set, OpenAI must be appended
    AFTER Claude and Gemini in the chain (last-resort fallback)."""
    from tessar.config import settings
    from tessar.llm import factory

    monkeypatch.setattr(settings, "vertex_project", "test-project")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")

    claude_seen: list[bool] = []
    gemini_seen: list[bool] = []
    openai_seen: list[bool] = []

    def fake_claude(*a: Any, **kw: Any) -> Any:
        claude_seen.append(True)
        raise RuntimeError("sdk-missing-in-test")

    def fake_gemini(*a: Any, **kw: Any) -> Any:
        gemini_seen.append(True)
        raise RuntimeError("sdk-missing-in-test")

    def fake_openai(*a: Any, **kw: Any) -> Any:
        openai_seen.append(True)
        raise RuntimeError("sdk-missing-in-test")

    with (
        patch(
            "tessar.llm.providers.vertex_claude.VertexClaudeProvider",
            side_effect=fake_claude,
        ),
        patch(
            "tessar.llm.providers.vertex_gemini.VertexGeminiProvider",
            side_effect=fake_gemini,
        ),
        patch(
            "tessar.llm.providers.openai_direct.OpenAIDirectProvider",
            side_effect=fake_openai,
        ),
    ):
        chain = factory._build_provider_chain()

    # All three constructors were attempted in order.
    assert claude_seen == [True]
    assert gemini_seen == [True]
    assert openai_seen == [True]
    # All three raised → fell back to mock.
    assert len(chain) == 1
    assert chain[0].name == "mock"


def test_factory_skips_openai_when_key_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    """When OPENAI_API_KEY is unset, OpenAI must not be wired in."""
    from tessar.config import settings
    from tessar.llm import factory

    monkeypatch.setattr(settings, "vertex_project", "test-project")
    monkeypatch.setattr(settings, "openai_api_key", None)

    openai_seen: list[bool] = []

    def fake_openai(*a: Any, **kw: Any) -> Any:
        openai_seen.append(True)
        raise RuntimeError("should-not-be-called")

    # Patch the real provider classes to no-op so we can inspect chain
    # without needing the SDKs.
    def fake_claude(*a: Any, **kw: Any) -> Any:
        raise RuntimeError("sdk-missing-in-test")

    def fake_gemini(*a: Any, **kw: Any) -> Any:
        raise RuntimeError("sdk-missing-in-test")

    with (
        patch(
            "tessar.llm.providers.vertex_claude.VertexClaudeProvider",
            side_effect=fake_claude,
        ),
        patch(
            "tessar.llm.providers.vertex_gemini.VertexGeminiProvider",
            side_effect=fake_gemini,
        ),
        patch(
            "tessar.llm.providers.openai_direct.OpenAIDirectProvider",
            side_effect=fake_openai,
        ),
    ):
        factory._build_provider_chain()

    assert openai_seen == []  # never attempted
