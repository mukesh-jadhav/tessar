# ADR-0017 — Hybrid KB retrieval: in-memory BM25 + pgvector cosine + RRF (Postgres migration deferred)

- **Status:** Accepted
- **Date:** 2026-05-18
- **Deciders:** TESSAR core
- **Supersedes:** none
- **Superseded-by:** none
- **Related:** [ADR-0016](0016-kb-scope-bounded-comprehensive.md) (KB scope ~300 records), [architecture.instructions.md](../../.github/instructions/architecture.instructions.md) (text-embedding-005 + Redis caching)

## Context

Today every downstream Tier-A agent (synthesizer, architect, cost_estimator, risk_writer) receives **100% of the KB** as a pass-through list — see [`apps/orchestrator/tessar/runner.py`](../../apps/orchestrator/tessar/runner.py) `kb_candidates = load_kb()`. At 10 components this is harmless. ADR-0016 grows the KB to ~300 records across 6 buckets; passing all 300 to every Tier-A call would:

1. Inflate Claude Sonnet 4.5 prompts by ~50k tokens per call → ~$0.15 extra per agent invocation × 4 agents = ~$0.60/run blown on irrelevant context. This alone breaches the $0.85 cap set in ADR-0015.
2. Drown the model's attention in unrelated options (e.g. asking it to pick between Cloud Run and 12 unrelated SaaS observability tools when the brief is about a backend service).
3. Make "which KB ids influenced this decision" impossible to audit — every record is technically in-prompt.

[IMPLEMENTATION.md §6.1](../../IMPLEMENTATION.md) calls for **hybrid retrieval: BM25 (Postgres `tsvector`) + vector (`pgvector`) + cross-encoder rerank** before Phase 3 ends. ADR-0016 confirms `hybrid-search (BM25+vector)` as a documented pattern in the KB itself.

## Decision

We adopt **hybrid retrieval with Reciprocal Rank Fusion (RRF)** between **BM25** (lexical) and **vector cosine similarity** (semantic, Vertex AI `text-embedding-005`), with the following pragmatic choices for MVP:

### 1. In-memory retrieval at MVP-scale (~300 records)

- KB records stay loaded from `kb-seed/*.yaml` into a Python list at orchestrator startup (current behaviour, kept).
- BM25 + cosine are computed **in-process against the loaded list** — no Postgres round-trips.
- Rationale:
  - 300 records × 1536-dim embeddings = ~1.8 MB of floats. Trivial RAM cost.
  - In-memory cosine over 300 vectors is sub-millisecond on Cloud Run.
  - Avoids a Postgres dependency in the agent hot path. Cloud SQL stays for run state / events / billing — not KB lookup.
  - Pure-Python BM25 (no `rank-bm25` dep) keeps the dependency surface minimal and the algorithm auditable.
- **When we migrate to Postgres-backed retrieval (HNSW + tsvector):** when KB exceeds ~3000 records OR when we need cross-run shared caching OR when retrieval latency exceeds 50ms. Tracked as `BACKLOG.md` item; not in MVP.

### 2. Embedding model: Vertex AI `text-embedding-005`

- 1536-dim. Already the dimensionality of the `embedding` column on `KbComponent` / `KbPattern` / `KbReferenceArch` per [`apps/orchestrator/tessar/db/models.py`](../../apps/orchestrator/tessar/db/models.py).
- New `tessar/llm/embeddings.py` module with lazy-imported `VertexEmbedder` (same pattern as the LLM providers per ADR-0015).
- Embeddings for KB records are computed at process startup and **cached to disk** under `~/.cache/tessar/embeddings/<sha256-of-record-content>.npy` so warm starts skip the Vertex round-trip. The cache key is hash of the indexed text (`name + capabilities + notes + pricing_model`), so any YAML edit invalidates that record's cached embedding automatically.
- For dev / CI without Vertex creds: `MockEmbedder` returns deterministic pseudo-embeddings (hash-seeded numpy random vectors) so unit tests are hermetic.

### 3. BM25 implementation: in-house, Okapi BM25

- ~40 lines of numpy. No `rank-bm25` dependency.
- Tokenisation: lowercase + strip non-alphanumeric, no stemming (KB vocabulary is small + technical; stemming hurts as often as it helps on identifiers like `kubernetes` / `kubernetes-engine`).
- Parameters: `k1=1.5`, `b=0.75` (literature defaults; can be tuned if eval shows benefit).
- Indexed text per record: `f"{name} {category} {vendor} {cloud} {' '.join(capabilities)} {' '.join(compliance)} {pricing_model or ''} {notes or ''}"`.

### 4. Fusion: Reciprocal Rank Fusion (RRF) with k=60

- Standard formula: `RRF(d) = Σ_q 1 / (k + rank_q(d))` over each ranked list (BM25, vector).
- k=60 per Cormack et al. (2009). Not tuned per query.
- Final ranking is by RRF score, descending. Top-K records returned to the agent.
- Why RRF over linear blending: RRF is parameter-free w.r.t. score scales (BM25 scores are unbounded; cosine is [-1, 1]) — no normalisation hyperparameter to drift.

### 5. Graceful degradation

- If no embeddings are available (Vertex unreachable, mock embedder absent in some test path) → return BM25-only ranking. Logged at WARN.
- If BM25 yields zero matches (e.g. the brief contains only stop-words for the indexed vocabulary) → fall back to vector-only.
- If both fail → return the first `top_k` records of the input list (current behaviour, but rare).

### 6. Top-K default

- `top_k = 20` for synthesizer / architect / cost_estimator / risk_writer.
- Rationale: with 300 records the prompt drops from ~50k to ~3k context tokens (10× shrink) while keeping enough alternatives for the model to genuinely choose. Tunable per agent if eval shows we're cutting off correct picks.

### 7. Cross-encoder reranking — DEFERRED

- Per IMPLEMENTATION.md §6.1: "start without rerank; add if eval shows need".
- Cross-encoders (e.g., BGE-reranker) add ~200ms + a second model inference per call. Don't pay that until eval shows top-20 RRF is missing correct picks.
- Slot is reserved: `HybridRetriever.__init__` takes an optional `reranker: Reranker | None` parameter; nothing is wired today.

### 8. Cite-back contract preserved

- Each retrieved record still carries its `id` (`gcp.cloud-run`, etc.). The synthesizer's "every pick must cite a KB id" rule continues to work unchanged.
- The retrieval call is logged + persisted as a structured `run_event` (kind=`retrieval`, payload includes query, top-K ids, scores). Required for the audit tab (Phase 3 gap item #11).

## Alternatives considered

| Option                                             | Why rejected                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pass full KB (status quo)**                      | Breaks $0.85/run cap once KB > ~50 records. Bad audit story.                                                                                         |
| **Postgres `tsvector` + pgvector HNSW from day 1** | DB round-trip in hot path; HNSW index tuning; migration churn. Premature at 300 records.                                                             |
| **Vector-only (no BM25)**                          | Loses lexical precision for exact-match terms (vendor names, compliance tags). BM25 + RRF consistently beats vector-only on small technical corpora. |
| **`rank-bm25` library**                            | Marginal value vs. 40 lines of numpy; another dep to track for freshness.                                                                            |
| **Cohere Rerank / Vertex AI Ranking API**          | External API + cost + latency. Adopt only after RRF baseline is measured insufficient.                                                               |
| **LLM-as-reranker**                                | Tempting but burns Tier-A tokens; defeats the purpose of cutting KB candidates before the LLM.                                                       |

## Consequences

**Positive**

- Tier-A prompt size + cost drop ~10× once KB hits ~300 records.
- Single, auditable retrieval path with deterministic fallback.
- Zero new infra (no Postgres index, no Redis, no external rerank API).
- Cite-back contract preserved → audit tab work in Phase 3 gap #11 stays simple.

**Negative**

- In-memory design caps KB at ~3000 records before we re-architect (acceptable for MVP per ADR-0016).
- BM25 in pure Python is slower than Postgres tsvector; at 300 records this is ~2ms (irrelevant), at 3000 it's ~20ms (still fine), at 30k it would be 200ms (then move to Postgres).
- Disk-cached embeddings invalidate per-record on YAML edit, but if the embedder model is bumped, the cache must be wiped manually. Tracked in operator runbook.

**Operational**

- New module `apps/orchestrator/tessar/retrieval/` (base, bm25, vector, hybrid).
- New module `apps/orchestrator/tessar/llm/embeddings.py` (VertexEmbedder + MockEmbedder).
- `runner.py` `kb_candidates = load_kb()` → `kb_candidates = await retriever.retrieve(query, top_k=20)`.
- Retrieval query construction: composed from `normalized.brief + requirements.summary + plan.research_questions_joined`. Validated by eval harness — if quality regresses on the golden brief set, tune the query composition first, parameters second.
- New disk cache directory: `~/.cache/tessar/embeddings/` (orchestrator process must have write access; Cloud Run has ephemeral `/tmp` we can use via env override).

## Migration path

1. Land hybrid retrieval (this ADR) with in-memory implementation.
2. Run nightly evals to confirm no regression on the 10-brief golden set (Phase 3 gap item #8).
3. When KB hits ~150 records, re-baseline `top_k` per agent.
4. When KB > ~3000 records OR retrieval > 50ms p95, write a follow-up ADR for Postgres-backed retrieval with HNSW index.

## Verification

- Unit tests in `tests/test_kb_retrieval.py` covering: BM25 ranking on a 10-record fixture, vector ranking with mock embeddings, RRF fusion correctness, graceful degradation paths.
- Integration: `runner.py` test that asserts `len(kb_candidates) ≤ top_k` after retrieval.
- Eval harness baselined post-merge.
