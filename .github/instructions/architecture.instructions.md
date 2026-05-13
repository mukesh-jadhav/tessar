---
applyTo: "**"
---
# TESSAR — Architecture & Tech Stack (do not drift)

Source of truth: [MVP.md](../../MVP.md) §3–§5. Locked decisions in [MVP.md](../../MVP.md) §9.

## Cloud (locked)
**Google Cloud Platform.** Single region at launch (`asia-south1` / `us-central1` / `europe-west1` — TBD). Do not introduce AWS or Azure resources for TESSAR's own infra.

## Two services (do not collapse, do not split further)
1. **`tessar-web`** — Next.js 15 + TypeScript on **Cloud Run** (min 1 in prod). Owns: UI, API routes, auth, billing webhooks, SSE endpoint.
2. **`tessar-orchestrator`** — Python 3.12 + LangGraph + Pydantic on **Cloud Run** (min 0, push-subscription target, concurrency=1, 60-min timeout). Owns: agent graph execution, artifact generation.

## Messaging split (intentional — do not unify)
- **Pub/Sub** (`tessar-runs` topic + DLQ) = durable job queue, web → worker handoff, OIDC-verified push.
- **Memorystore Redis** = live progress event Streams (worker → SSE), prompt/retrieval cache. Events also persisted to Postgres `run_events`.

## Locked component choices
| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui (themed M3 Expressive — see `design-language.instructions.md`) |
| Auth | Auth.js (magic link via Resend + Google OAuth). Identity Platform later for enterprise. |
| Payments | Stripe Checkout + Webhooks (single tier MVP) |
| Orchestrator runtime | Python 3.12 + LangGraph + Pydantic |
| LLM primary | **Vertex AI Gemini** (frontier/flash/nano tiers) |
| LLM fallback | **Claude on Vertex AI** (same SDK), then OpenAI direct as last resort |
| Embeddings | Vertex AI `text-embedding-005` |
| Web search | Tavily primary, Brave fallback |
| Scrape | Trafilatura + Playwright |
| DB | **Cloud SQL Postgres 16 + pgvector** (one DB for relational + vectors at MVP) |
| Cache/queue (intra-run) | Memorystore Redis (Basic 1GB MVP) + arq for in-process scheduling |
| Object storage | Cloud Storage (signed URLs, lifecycle to Nearline 30d) |
| Secrets | Secret Manager via per-service service accounts |
| PDF | WeasyPrint (MD → HTML → PDF) |
| Diagrams | **Mermaid only** at MVP (mermaid-cli for SVG/PNG). No Structurizr until post-MVP. |
| Edge | Global External HTTPS LB + Cloud CDN + Cloud Armor (WAF) |
| Observability | OpenTelemetry → Cloud Trace + Logging + Monitoring; Grafana Cloud dashboards; Sentry for FE+BE exceptions |
| CI/CD | GitHub Actions + Workload Identity Federation to GCP |
| IaC | **Terraform (Google provider)**. No Bicep/CDK/Pulumi. |
| Container registry | Artifact Registry |
| Email | Resend |
| Analytics + flags | PostHog |

## Agent graph (do not reorder without ADR)
`intake_normalizer → requirements_extractor (with clarify loop) → research_planner → research_worker × N (parallel) → synthesizer → architect → cost_estimator → risk_and_tradeoff_writer → packager`

Every node: validates output via Pydantic, emits a structured progress event, records prompts+model+sources used.

## LLM tier policy (do not bypass)
- **Tier-A (frontier):** synthesizer, architect, risk writer.
- **Tier-B (mid):** research workers, requirements extractor.
- **Tier-C (cheap):** classification, intake normalization, source dedup.
- Provider routing: Gemini → Claude-on-Vertex → OpenAI direct (only on quota/error).
- Hard per-run token budget; abort + refund + alert if exceeded.
- Aggressive prompt+retrieval caching in Redis (key: normalized input hash + KB snapshot id).

## KB (do not work around)
- Source of truth: **YAML in `kb-seed/`**, PR-reviewed, loaded into Postgres at deploy.
- Re-verification job runs weekly; freshness SLA 90 days per record.
- No admin UI in MVP.

## Repo layout (do not deviate)
See [MVP.md](../../MVP.md) §6. Monorepo with `apps/web`, `apps/orchestrator`, `packages/shared-schemas`, `packages/prompts`, `kb-seed/`, `evals/`, `infra/`, `.github/workflows/`, `docs/`.

## Cloud-portability rule
Keep code free of GCP-specific imports outside thin adapter layers (`storage/`, `queue/`, `secrets/`, `llm/`). Future port to Azure/AWS for enterprise must be a vendor relabel, not a rewrite.

## Security baseline (non-negotiable, see [MVP.md](../../MVP.md) §5.8)
- All public traffic via Global LB + TLS only; HSTS on.
- Cloud Run `--ingress=internal-and-cloud-load-balancing`.
- Per-service service accounts, least privilege.
- Cloud SQL & Memorystore on Private IP only.
- Pub/Sub push verified via OIDC token (audience-bound).
- Stripe webhooks signature-verified + idempotency keys.
- Input validation: Zod (web) + Pydantic (worker). LLM outputs validated against Pydantic before persisting.
- Secrets only via Secret Manager. No env files in repo, no plaintext in images.
- Logging excludes PII and full briefs; full briefs only in encrypted Cloud Storage behind authenticated download.

## When making code changes
- Touching architecture? Read [MVP.md](../../MVP.md) §3 first.
- Adding a new dependency at the framework/cloud-service level? Requires an ADR in `docs/adr/`.
- Adding a new agent? Update agent graph diagram in [MVP.md](../../MVP.md) §3.4 and write a Pydantic schema for its output.
