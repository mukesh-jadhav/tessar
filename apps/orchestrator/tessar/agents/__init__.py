"""Agent implementations.

Each agent module exposes a single async function with the signature
`(input, *, router, ...) -> output` where `output` is a Pydantic model.
Agents NEVER touch the network directly — they go through `tessar.llm`.
"""
