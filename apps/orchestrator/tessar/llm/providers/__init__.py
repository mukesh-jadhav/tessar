"""Provider adapters.

Each provider implements `LlmProvider` from `base.py`. The router walks the
configured chain (Gemini -> Claude -> OpenAI) on transient failures.

Real providers (Vertex Gemini / Vertex Claude / OpenAI) are implemented as
optional adapters whose imports are guarded — importing this package never
fails, even when the cloud SDKs are not installed locally.
"""
