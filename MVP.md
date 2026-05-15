# TESSAR — MVP Specification (Google Cloud)

> Companion to [PLAN.md](PLAN.md). This document narrows scope to a shippable MVP with concrete component choices, system design, and deployment on **Google Cloud Platform (GCP)**.

---

## 1. MVP Scope (what's in, what's out)

### 1.1 In Scope — Must-Have Features

1. **Free-text + guided wizard intake** (one screen, both modes available).
2. **Requirements extractor** with at most 3 clarifying questions.
3. **Multi-agent research orchestrator** with **live progress stream** (SSE).
4. **Curated component knowledge base** (seeded with ~150 records covering one domain).
5. **Web research** with source citation and snapshot caching.
6. **Architecture generator** producing:
   - C4 Context + Container diagrams
   - Data flow diagram
   - **Three sequence diagrams** (write path, read path, one critical async/admin path) — see ADR-0006
   - All as **Mermaid** (rendered to SVG/PNG)
7. **System-design narrative** (ADR-0006), produced by an enhanced architect + synthesizer:
   - **Integration contracts** per critical edge (message/RPC shape, sync vs async, idempotency, retry policy)
   - **"Fits because" component rationale** linking each critical pick to a specific requirement and citation
   - **Failure-modes table** per critical component (failure → detection → recovery → RTO/RPO)
   - **Phased build sequence** (week-1 / week-2 / week-3 ordering of what to stand up first and why)
8. **Trade-off / ADR generator** (one ADR per major decision).
9. **Cost estimator** (launch + 10× scale).
10. **Design package output**: Executive Summary, Requirements, Diagrams, BOM, Trade-offs, Cost Model, Risk Register, Build Plan, Citations, **How-this-fits-together (system-design narrative)**.
11. **Markdown + PDF export**.
12. **Pay-per-run checkout** (Stripe, single tier).
13. **Single-user accounts** (email magic link + Google OAuth via Auth.js).
14. **Run history & view-past-runs**.
15. **Eval harness** (internal, gates releases) — includes graders for the five new ADR-0006 narrative sections.

### 1.2 Recommendation Cloud Coverage

TESSAR's **recommendations** at MVP cover **GCP first (full depth: BOM + cost), with AWS and Azure as secondary comparison surfaces** (component list + equivalents, no full cost). Multi-cloud parity is a v1.x feature.

> Rationale: anchor on the cloud we operate in (so we dogfood our own designs), but acknowledge that SaaS architects often want a multi-cloud sanity check.

### 1.3 Explicitly Out of Scope (for MVP)

- Voice intake, document/image upload
- Full multi-cloud parity (AWS / Azure depth match GCP)
- Compliance overlays beyond a basic checklist
- IaC scaffold export
- Notion/Confluence/draw.io exports
- Team workspaces, sharing, RBAC
- Templates marketplace
- Re-run diff view (re-run yes, diff no)
- Live monitoring / alerts
- API access
- Mobile app

### 1.4 Anchor Domain

Launch domain: **SaaS web applications** (B2B/B2C web apps with auth, DB, async jobs, basic analytics, optional AI features). Tractable KB, broad demand, easy to grade quality.

---

## 2. MVP User Journey

```
Landing → Sign in → New Run
   → Brief screen (text + optional wizard fields + budget + cloud preference)
   → Pay (Stripe Checkout) — one flat price
   → Run page (live progress: requirements → research threads → synthesis → diagrams → packaging)
   → Up to 3 clarifying questions appear inline if needed
   → Result page (tabbed package) → Export PDF/Markdown
   → Run appears in history; can re-run with edits
```

Target end-to-end run time: **8–15 minutes**.

---

## 3. System Design of TESSAR (MVP)

### 3.1 High-Level Architecture

```
                          ┌─────────────────────────┐
                          │      Browser (SPA)      │
                          │   Next.js + React       │
                          └───────────┬─────────────┘
                                      │ HTTPS / SSE
                          ┌───────────▼─────────────┐
                          │  Global External HTTPS  │
                          │  Load Balancer + Cloud  │
                          │  Armor (WAF) + Cloud    │
                          │  CDN                    │
                          └───────────┬─────────────┘
                                      │
                          ┌───────────▼─────────────┐
                          │  tessar-web             │
                          │  Cloud Run (Next.js +   │
                          │  API + SSE)             │
                          └───────────┬─────────────┘
                                      │ publishes job
                          ┌───────────▼──────────────┐
                          │  Pub/Sub topic           │
                          │   tessar-runs            │
                          │   (+ DLQ subscription)   │
                          └───────────┬──────────────┘
                                      │ push subscription
                          ┌───────────▼───────────────┐
                          │  tessar-orchestrator      │
                          │  Cloud Run service        │
                          │  (Python + LangGraph)     │
                          │  Concurrency 1 / instance │
                          │                           │
                          │  Agents:                  │
                          │   • Intake Normalizer     │
                          │   • Requirements Extract  │
                          │   • Research Planner      │
                          │   • Research Workers (∥)  │
                          │   • Synthesizer           │
                          │   • Architect (diagrams)  │
                          │   • Cost Estimator        │
                          │   • Risk & Trade-off      │
                          │   • Packager              │
                          └─┬───────┬────────┬────────┘
                            │       │        │
                  ┌─────────▼─┐  ┌──▼─────┐ ┌▼─────────────────┐
                  │ Cloud SQL │  │ Web    │ │ LLM Router       │
                  │ Postgres  │  │ Search │ │ (Vertex AI:      │
                  │ + pgvector│  │ (Tavily│ │  Gemini primary, │
                  │ (KB +     │  │ /Brave)│ │  Claude on       │
                  │ relational│  └────────┘ │  Vertex fallback)│
                  └─────┬─────┘             └──────────────────┘
                        │
   Memorystore Redis  ◄─┘  pub/sub + Streams for SSE event fan-out
   Cloud Storage           artifacts (PDFs, SVGs, JSON packages)
   Secret Manager          all secrets, accessed via service account
   Cloud Trace / Logging
   + OpenTelemetry         traces / metrics / logs
   Sentry                  FE+BE exceptions
```

### 3.2 Service Decomposition

For MVP we run **two deployable services** to stay simple:

1. **`tessar-web`** — Next.js app on Cloud Run: UI, API routes (auth, billing webhooks, run create/read, exports), SSE endpoint that tails run progress.
2. **`tessar-orchestrator`** — Python worker on Cloud Run (push-subscription target): consumes jobs from Pub/Sub, runs the agent graph, writes progress events + final artifacts.

Shared infra: Cloud SQL for PostgreSQL, Memorystore for Redis, Pub/Sub, Cloud Storage, Secret Manager, Artifact Registry.

> Why two services and not one? The Node ecosystem is best for the SPA + auth + Stripe + SSE; the Python ecosystem is best for LangGraph + LLM SDKs. A clean split now avoids a painful split later.

### 3.3 Why Pub/Sub _and_ Redis (not just one)

- **Pub/Sub** = durable, at-least-once messaging with built-in retries, exponential backoff, and **dead-letter topics**. Used to hand a run from web → worker; integrates natively with Cloud Run **push subscriptions** (no polling, no KEDA needed).
- **Memorystore Redis** = low-latency Streams/pub-sub for **progress events** (worker → web SSE). Pub/Sub would also work but is optimized for back-end fan-out, not millisecond UI streaming; Redis Streams give us a cheap, replayable event log for the live UI.

Cost is small (cheap Pub/Sub at low volume + smallest Memorystore tier).

### 3.4 Agent Graph (inside orchestrator)

```
intake_normalizer
       │
       ▼
requirements_extractor ──► (clarify? yes ► emit_question ► wait_for_answer)
       │
       ▼
research_planner  ── decomposes into N parallel threads
       │
   ┌───┼───┬───┬─── ... (fan-out)
   ▼   ▼   ▼   ▼
research_worker × N   (each: KB lookup → web search → cite → summarize)
   │   │   │   │
   └───┴───┼───┘   (fan-in)
           ▼
   synthesizer  (picks components, resolves conflicts, scores trade-offs)
           │
           ▼
   architect  (produces C4 + data flow + sequence as Mermaid)
           │
           ▼
   cost_estimator  (queries GCP Cloud Billing Catalog API + KB SaaS catalog)
           │
           ▼
   risk_and_tradeoff_writer (ADRs)
           │
           ▼
   packager  (assembles MD + renders PDF + uploads to Cloud Storage)
```

Every node emits a structured progress event → Redis Stream → SSE → browser.

### 3.5 Data Model (essentials)

- `users(id, email, auth_provider, created_at)`
- `runs(id, user_id, status, brief_json, constraints_json, price_cents, stripe_payment_intent, created_at, completed_at)`
- `run_events(id, run_id, ts, kind, payload_json)` — append-only stream (Redis is hot path; Postgres is durable copy)
- `run_artifacts(id, run_id, kind, gcs_uri, mime, created_at)` — PDF, MD, JSON package, individual SVGs
- `kb_components(id, name, category, vendor, cloud, pricing_model, regions, compliance[], limits_json, sources[], last_verified_at, embedding vector(1536))`
- `kb_patterns(id, name, when_to_use, when_not_to_use, examples[], embedding)`
- `kb_reference_archs(id, domain, summary, components_json, embedding)`
- `eval_briefs(id, brief, gold_package_json, last_score, last_run_at)`

### 3.6 Knowledge Base — MVP Seed

- **~150 GCP component records** + **~80 AWS equivalents** + **~80 Azure equivalents** (lighter metadata) + **~40 cloud-neutral SaaS/OSS** records.
- GCP coverage areas: compute (Cloud Run, Cloud Run Jobs, GKE Autopilot, Compute Engine), DBs (Cloud SQL Postgres/MySQL, AlloyDB, Spanner, Firestore, MongoDB Atlas), object storage (Cloud Storage), queues (Pub/Sub, Cloud Tasks, Eventarc), search (Vertex AI Search, Algolia, Meilisearch, Elastic Cloud), auth (Identity Platform, Firebase Auth, Auth0, Clerk, Supabase Auth), CDN (Cloud CDN, Cloudflare), email (SendGrid, Postmark, Resend), payments (Stripe), observability (Cloud Logging/Trace/Monitoring, Datadog, Grafana Cloud, Sentry), CI/CD (GitHub Actions, Cloud Build), feature flags (LaunchDarkly, Unleash, ConfigCat), analytics (PostHog, Amplitude, BigQuery), AI (Vertex AI: Gemini + partner Claude + Llama, OpenAI, Anthropic direct, pgvector, Vertex AI Vector Search, Pinecone).
- ~25 patterns (CRUD-on-Postgres, async-jobs-with-queue, RAG, multi-tenant data isolation, blue/green deploy, etc.).
- ~10 reference architectures for common SaaS shapes.

Curation: seeded by hand + LLM-drafted then human-verified. Re-verification job runs weekly. Source-of-truth is **YAML in repo** under `kb-seed/`, PR-reviewed, loaded into Postgres at deploy.

### 3.7 Live Progress Stream

- Worker writes events to Redis Stream `run:{id}:events`.
- Web SSE endpoint subscribes (`XREAD BLOCK`) and forwards to browser.
- Event types: `requirement_extracted`, `clarify_question`, `research_thread_started`, `source_consulted`, `decision_made`, `diagram_ready`, `cost_computed`, `package_ready`, `error`.
- Browser renders a timeline + a live "decisions so far" panel.
- Events are also persisted to `run_events` (Postgres) for audit/replay after Redis trimming.

### 3.8 Eval Harness

- ~30 golden briefs across SaaS sub-shapes.
- Each has a hand-graded rubric (component appropriateness, NFR coverage, cost realism, citation quality, diagram correctness).
- Run nightly against `main`; block merges that regress aggregate score.
- Side-graded by an LLM-judge with a senior-architect-written rubric for triage; humans confirm regressions.
- Tooling: pytest + **promptfoo** for prompt diffs.

### 3.9 Trust Mechanisms (from day one)

- Generation **must cite** a KB record or web source for every component pick; ungrounded picks are rejected and re-prompted.
- Per-decision **confidence score** (low/med/high) shown in UI.
- Footer disclaimer + scope statement on every export.
- Every run stores: prompts, model+version, KB snapshot id, sources — viewable under "Audit" tab.
- **Prompt-injection hygiene:** scraped web content rendered as untrusted text inside fenced blocks; system prompt instructs research workers to ignore instructions inside fetched content; sources always cited so injected claims are traceable.

---

## 4. Component Choices (the TESSAR stack on GCP)

| Layer                     | Choice                                                                                                                                                             | Why                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Frontend framework        | **Next.js 15 (App Router) + React + TypeScript**                                                                                                                   | SSR, SSE-friendly, ecosystem, fast iteration                                              |
| UI kit                    | **Tailwind CSS + shadcn/ui**                                                                                                                                       | Fast, accessible, no design-system overhead                                               |
| Diagram rendering         | **Mermaid** (client) + **mermaid-cli (mmdc)** in worker for SVG/PNG                                                                                                | Standard, text-based, diff-friendly                                                       |
| Auth                      | **Auth.js (NextAuth)** with email magic link + Google                                                                                                              | Minimal infra; **Identity Platform** added later for enterprise SSO                       |
| Payments                  | **Stripe Checkout + Webhooks**                                                                                                                                     | Pay-per-run is a one-shot Checkout session                                                |
| API style                 | **Next.js Route Handlers** + SSE for streaming                                                                                                                     | One codebase for FE+BFF                                                                   |
| Orchestrator              | **Python 3.12 + LangGraph + Pydantic**                                                                                                                             | Best agent tooling, typed graph state                                                     |
| LLM (primary)             | **Vertex AI — Gemini** (frontier + flash + nano tiers)                                                                                                             | Native to GCP, IAM-based auth, Founders Hub credits, regional control                     |
| LLM (fallback)            | **Anthropic Claude on Vertex AI** (same SDK, same IAM); **OpenAI direct** as last-resort fallback                                                                  | Single vendor surface for two providers; OpenAI direct only if both Vertex paths are down |
| Embeddings                | **Vertex AI `text-embedding-005`** (or successor)                                                                                                                  | Single vendor + region for vectors                                                        |
| Web search                | **Tavily** (primary) + **Brave Search** (fallback)                                                                                                                 | Built for LLM agents, cite-friendly, cloud-neutral                                        |
| Scrape/snapshot           | **Trafilatura** + **Playwright** for JS-heavy pages                                                                                                                | Clean text extraction, full snapshot for citation                                         |
| Job queue (durable)       | **Pub/Sub** topic `tessar-runs` with **push subscription** to orchestrator + dead-letter topic                                                                     | Zero-ops, native Cloud Run integration, at-least-once with retries                        |
| Event stream (live UI)    | **Memorystore for Redis** (Basic, 1 GB)                                                                                                                            | Streams + pub/sub for SSE fan-out                                                         |
| In-process scheduling     | **arq** (Python, on Redis) for sub-tasks within a run                                                                                                              | Lightweight intra-worker orchestration                                                    |
| Primary DB                | **Cloud SQL for PostgreSQL 16** with **pgvector**                                                                                                                  | One DB for relational + vectors at MVP scale                                              |
| Object storage            | **Cloud Storage** (Standard class, lifecycle to Nearline/Coldline)                                                                                                 | Standard for artifacts                                                                    |
| Secrets                   | **Secret Manager** (accessed via per-service account, no static creds)                                                                                             | Native, audit-logged, no secrets in env files                                             |
| PDF rendering             | **WeasyPrint** (Python) from MD→HTML→PDF                                                                                                                           | Reliable, no headless-Chrome cost                                                         |
| Markdown pipeline         | **markdown-it** (web) / **markdown-it-py** (worker)                                                                                                                | Consistent rendering both sides                                                           |
| Cost data                 | **GCP Cloud Billing Catalog API + Pricing Calculator data** (primary) + **AWS Pricing API** & **Azure Retail Prices API** (secondary) + curated SaaS catalog in KB | Authoritative for primary cloud, comparison for others                                    |
| Edge / CDN / WAF          | **Global External HTTPS Load Balancer + Cloud CDN + Cloud Armor**                                                                                                  | TLS, WAF (managed OWASP rules), edge caching, custom domains                              |
| DNS                       | **Cloud DNS**                                                                                                                                                      | Native, scriptable in Terraform                                                           |
| Observability             | **OpenTelemetry SDK** → **Cloud Trace + Cloud Logging + Cloud Monitoring** + **Grafana Cloud** dashboards (Cloud Monitoring exporter) + **Sentry**                 | Cloud Ops native to GCP; Sentry for UX errors                                             |
| Feature flags + analytics | **PostHog** (cloud)                                                                                                                                                | Free tier sufficient for MVP, cloud-neutral                                               |
| Email (transactional)     | **Resend**                                                                                                                                                         | Simple API, good deliverability                                                           |
| Eval harness              | Python pytest + **promptfoo**                                                                                                                                      | Lightweight, CI-native                                                                    |
| CI/CD                     | **GitHub Actions** with **Workload Identity Federation** to GCP                                                                                                    | No static cloud secrets in GH                                                             |
| IaC                       | **Terraform** (Google provider)                                                                                                                                    | Mature, multi-cloud-portable; matches what we recommend                                   |
| Container registry        | **Artifact Registry** (Docker repo)                                                                                                                                | Native to Cloud Run, regional                                                             |

### 4.1 LLM Cost & Routing Strategy

- **Tier-A (frontier — e.g., Gemini 2.x Pro / Claude Sonnet on Vertex)** for: synthesizer, architect, risk writer.
- **Tier-B (mid — e.g., Gemini Flash)** for: research workers, requirements extractor.
- **Tier-C (cheap — Gemini Flash-Lite/Nano tier)** for: classification, intake normalization, source dedup.
- **Provider routing:** Gemini primary; on quota/error, fall back to Claude-on-Vertex at equivalent tier; OpenAI direct is the last-resort path.
- Aggressive **prompt + retrieval caching** in Redis (keyed by normalized brief slice + KB snapshot).
- Hard per-run token budget; orchestrator aborts and refunds if exceeded (alert internally).

### 4.2 Auth.js, not Identity Platform — for now

For MVP we need email magic link + Google OAuth. Auth.js gives both with no GCP-specific setup. **Identity Platform / Firebase Auth** is added when we ship the enterprise tier — it then unlocks SSO/SAML/OIDC without rewriting our session model (Auth.js supports OIDC providers).

---

## 5. Deployment Architecture

### 5.1 Cloud & Topology

- **Cloud:** GCP, single region at launch — `asia-south1` (Mumbai), `us-central1`, or `europe-west1` depending on user geography and Vertex AI model availability. Multi-zone within region (Cloud Run is multi-zonal by default).
- **Networking:** One **VPC** with a **regional subnet**; **Serverless VPC Connector** (or **Direct VPC Egress**) so Cloud Run can reach Cloud SQL and Memorystore on private IPs.
- **Private services:** Cloud SQL via **Private IP**; Memorystore via private IP; Secret Manager via VPC Service Controls (later).
- **DNS / TLS:** Cloud DNS + Google-managed certs on the load balancer.
- **Ingress:** Global External HTTPS Load Balancer (with Cloud CDN + Cloud Armor) → Cloud Run via **Serverless NEG**.

### 5.2 Compute

- **`tessar-web`** → **Cloud Run service**, **min instances = 1** in prod (avoid cold-start on first user), max = N. Concurrency 80 (default), 1 vCPU / 1 GiB.
- **`tessar-orchestrator`** → **Cloud Run service** as the **target of a Pub/Sub push subscription**. **Concurrency = 1** per instance (one run at a time per container) so LangGraph state is isolated; min = 0, max = N. Request timeout raised to 60 minutes (Cloud Run supports up to 60 min for HTTP). Long runs that exceed this fall back to **Cloud Run Jobs** (rare; v1.x).

> **Why Cloud Run over GKE Autopilot or Compute Engine?**
>
> - **GKE Autopilot** is overkill for two services and adds full Kubernetes operational burden.
> - **Compute Engine** means we own the OS, scaling, and patching.
> - **Cloud Run** hits the sweet spot: true scale-to-zero (or min=1 when needed), per-100ms billing, native Pub/Sub integration, fast deploys via gcloud or Terraform, OIDC to GitHub Actions out of the box.

### 5.3 Data Plane

- **Cloud SQL for PostgreSQL 16** with **pgvector** extension. Tier: **db-custom-2-7680** (2 vCPU / 7.5 GB) at MVP, **regional HA** (synchronous standby in another zone), automated backups + 7-day PITR. Private IP only.
- **Memorystore for Redis 7**, **Basic tier, 1 GB** at MVP (single node), upgrade to **Standard** (replicated) once SSE traffic justifies. Private IP only.
- **Pub/Sub:** topic `tessar-runs` with a push subscription to the orchestrator; dead-letter topic `tessar-runs-dlq`; max delivery attempts = 5 with exponential backoff.
- **Object storage:** Cloud Storage bucket `tessar-artifacts-prod`, prefix `runs/`, lifecycle: Standard → Nearline after 30 days, delete after 1 year unless user pinned. **Signed URLs** with short TTL for downloads.
- **Secrets:** Secret Manager, accessed via **per-service service accounts** with `roles/secretmanager.secretAccessor` scoped to specific secrets.

### 5.4 Edge & Static

- **Global External HTTPS Load Balancer** in front of:
  - Backend 1: `tessar-web` Cloud Run via Serverless NEG (dynamic + SSE)
  - Backend 2: Cloud Storage bucket via backend bucket (static marketing/landing assets if split)
- **Cloud CDN** enabled on the static backend; bypassed for `/api/*` and SSE routes.
- **Cloud Armor** WAF policy: managed OWASP ruleset + rate limit on `/api/runs` and `/api/auth`.

### 5.5 CI/CD

- GitHub Actions:
  - **PR pipeline:** lint, type-check, unit tests, eval harness on a small subset, build container images.
  - **Main pipeline:** full eval harness, build & push to Artifact Registry, `terraform apply` against `prod`, Cloud Run deploy with **traffic split** (10% → 100% over 10 min using `gcloud run services update-traffic`).
- **Workload Identity Federation** from GitHub → GCP service account with least-privilege bindings (deployer role on a single project per environment).

### 5.6 Environments

- `dev` — single shared GCP project, `db-f1-micro` Postgres (or `db-custom-1-3840`), no HA, smaller Cloud Run quotas.
- `prod` — separate GCP project, regional HA Postgres, min replicas = 1.
- **Local dev:** Docker Compose with Postgres + pgvector + Redis + **fake-gcs-server** (Cloud Storage emulator) + the official **Pub/Sub emulator** + the two services.

### 5.7 Observability & Ops

- **OpenTelemetry SDK** in both services exporting to **Cloud Trace** and **Cloud Logging** (via OTLP / GCP exporter). Cloud Run auto-instruments request traces.
- **Per-run trace** is a first-class artifact (linked from the run page, "Audit" tab) — pulled from Cloud Trace via REST API at view time.
- **Sentry** for FE + BE exceptions and release tracking.
- **Grafana Cloud** dashboards (sourcing Cloud Monitoring metrics) for unified view including LLM/search-API custom metrics.
- Dashboards: Pub/Sub backlog, run duration p50/p95, LLM cost per run, eval score trend, error rate, Cloud SQL connection pool.
- Alerts via **Cloud Monitoring alert policies** → email/Slack via PagerDuty free tier:
  - Pub/Sub `oldest_unacked_message_age` > threshold for 10m
  - Run failure rate > 5% over 1h
  - Stripe webhook failures > 0 in 5m
  - Cloud SQL CPU > 80% for 15m
  - Eval score regression on main (GitHub Action posts to Slack)

### 5.8 Security Baseline

- All public traffic via Global LB with TLS only; HSTS enabled.
- Cloud Run services configured with **`--ingress=internal-and-cloud-load-balancing`**; only the LB can reach them.
- **Per-service service accounts**, least privilege; no shared default service accounts.
- Cloud SQL & Memorystore reachable only via **Private IP** through the Serverless VPC Connector.
- Auth: email magic link + Google OAuth via Auth.js; sessions via signed cookies (HTTP-only, Secure, SameSite=Lax).
- CSRF on state-changing routes; rate limits on intake and auth endpoints (Cloud Armor + in-app token bucket).
- Stripe webhooks signature-verified; idempotency keys on payment → run creation.
- Input validation with Zod (web) and Pydantic (worker); LLM outputs validated against Pydantic schemas before persisting.
- **Pub/Sub push** is verified via OIDC token (audience-bound) so only Pub/Sub can invoke the orchestrator endpoint.
- **Prompt-injection hygiene** as in §3.9.
- Logging excludes PII and full briefs by default; full briefs only in encrypted Cloud Storage artifacts behind authenticated download.
- Backups: Cloud SQL automated PITR + weekly logical dumps to Cloud Storage (multi-region bucket when budget allows).
- Dependency scanning (GitHub Dependabot + `npm audit` / `pip-audit` in CI) + **Artifact Registry vulnerability scanning** on container images.
- **Security Command Center** Standard on the project (free tier at MVP).
- Org-policy guardrails: disable default-VPC, require uniform bucket-level access, require CMEK later for sensitive tiers.

### 5.9 Cost Sketch (rough monthly, MVP idle baseline)

> Order-of-magnitude only; refined once usage data exists. Assumes no GCP credits.

- Cloud Run `tessar-web` (min 1, 1 vCPU/1 GiB) — ~$15–30
- Cloud Run `tessar-orchestrator` (min 0, scale-on-Pub/Sub) — ~$0–10 idle, variable on usage
- Cloud SQL Postgres (`db-custom-2-7680`, regional HA) — ~$120–160 (this is the biggest fixed line)
- Memorystore Redis (Basic, 1 GB) — ~$35
- Pub/Sub — ~$0–2 at MVP traffic
- Global LB + Cloud CDN + Cloud Armor — ~$25–35 base + traffic
- Cloud Storage + Artifact Registry — single digits at MVP
- Secret Manager, Cloud DNS, Logging/Monitoring (small) — ~$10–20
- Serverless VPC Connector — ~$10
- Grafana Cloud / Sentry / PostHog / Resend / PagerDuty — free tiers
- LLM + search APIs — variable; budgeted per run, passed through in pricing
- **Baseline infra:** roughly **$220–310/month** before traffic; LLM cost scales per run and is the dominant variable cost.

> **Google for Startups Cloud Program** can offset most of this with up to $200k in GCP credits depending on tier — apply before provisioning paid resources. If budget is tight pre-credits, downgrade Cloud SQL HA to single-zone in `dev` and switch to a smaller tier for the first weeks of `prod`.

---

## 6. Repository Layout

```
tessar/
├── apps/
│   ├── web/                 # Next.js (tessar-web)
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── ...
│   └── orchestrator/        # Python worker (tessar-orchestrator)
│       ├── tessar/
│       │   ├── agents/
│       │   ├── kb/
│       │   ├── llm/
│       │   ├── pricing/
│       │   ├── diagrams/
│       │   ├── packager/
│       │   └── graph.py
│       ├── tests/
│       └── pyproject.toml
├── packages/
│   ├── shared-schemas/      # JSON Schemas / OpenAPI shared between web & worker
│   └── prompts/             # Versioned prompt templates (text + metadata)
├── kb-seed/                 # YAML seed data for components, patterns, refs
├── evals/
│   ├── briefs/              # Golden briefs + rubrics
│   ├── runners/
│   └── reports/
├── infra/
│   ├── terraform/
│   │   ├── envs/
│   │   │   ├── dev/
│   │   │   └── prod/
│   │   └── modules/
│   │       ├── network/
│   │       ├── data/
│   │       ├── compute/
│   │       └── edge/
│   └── docker-compose.yml   # Local dev
├── .github/workflows/
└── docs/
    ├── PLAN.md
    ├── MVP.md               # this document
    └── adr/                 # ADRs for TESSAR's own decisions
```

---

## 7. Build Order

1. **Repo, infra skeleton, CI** — Terraform for VPC + Cloud SQL + Memorystore + Pub/Sub + Cloud Storage + Secret Manager + Artifact Registry; GH Actions Workload Identity Federation to GCP.
2. **Local dev loop** (docker-compose with fake-gcs-server + Pub/Sub emulator) and shared schemas.
3. **KB schema + seed loader**; load 50 GCP components manually first.
4. **Orchestrator skeleton** — agent graph runs end-to-end on one hard-coded brief, no UI.
5. **LLM router** (Gemini primary, Claude-on-Vertex fallback) + prompt templates + Pydantic-validated outputs.
6. **Research worker** — KB retrieval + Tavily + citation pipeline.
7. **Synthesizer + architect (Mermaid)** + cost estimator (Cloud Billing Catalog API).
8. **Packager** — MD + WeasyPrint PDF → Cloud Storage.
9. **Web app** — Auth.js, brief form, run page with SSE, result viewer, history.
10. **Stripe Checkout** + webhook → publish run to Pub/Sub.
11. **Eval harness** with 10 briefs; wire into CI.
12. **Observability** end-to-end (Cloud Trace + Cloud Logging + Sentry + Grafana); per-run trace tab.
13. **Hardening** — Cloud Armor rate limits, security headers, backup verification, runbook, Security Command Center baseline.
14. **Closed beta** with 10 invited users; collect feedback; tune prompts and KB.
15. **Public launch** when eval score crosses bar and median run cost is within target margin.

---

## 8. Definition of Done for MVP

- A signed-in user can describe a SaaS web app idea, pay once, and receive within ~15 minutes a downloadable PDF + Markdown design package containing: requirements, C4 + data flow + **three** sequence diagrams (write/read/async), BOM with citations, ADRs for top decisions, **GCP** cost estimate at launch and 10× scale (with AWS and Azure equivalents listed but not fully costed), risk register, build plan, **and the ADR-0006 system-design narrative (integration contracts, component rationale, failure modes, phased build sequence)**.
- Every component pick traces to a KB record or cited source; every "fits because" rationale references the specific requirement it satisfies.
- Eval score on golden briefs ≥ agreed threshold; no regression in last 7 nightly runs. Eval harness includes graders for each of the five ADR-0006 narrative sections.
- Median per-run gross margin ≥ target (price − LLM/search/infra variable cost). Per-run LLM budget cap raised ~30% over original MVP estimate to accommodate the richer architect + synthesizer output (see §5.7).
- Cloud SQL backups restore-tested; runbook for stuck Pub/Sub backlog, LLM provider outage, Stripe webhook replay exists.
- Security baseline (§5.8) verified by checklist; no high-severity issues open.

---

## 9. Decisions Locked

| Decision                    | Choice                                                                                     | Notes                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Cloud for TESSAR itself     | **Google Cloud (GCP)**                                                                     | Cloud Run DX, Vertex AI for Gemini + Claude in one SDK, Google for Startups credits                  |
| Web hosting                 | **Cloud Run** (not Vercel, not GKE)                                                        | Private networking to Cloud SQL/Memorystore via Serverless VPC Connector, single-cloud billing & IAM |
| Worker hosting              | **Cloud Run** with Pub/Sub push subscription                                               | Zero-ops, native scaling, no KEDA                                                                    |
| Anchor recommendation cloud | **GCP first; AWS + Azure secondary**                                                       | Dogfood + acknowledge both alternatives are common                                                   |
| Frontier LLM default        | **Vertex AI Gemini** primary, **Claude on Vertex** fallback, **OpenAI direct** last-resort | Confirm by eval on 5 hand-graded briefs before locking model SKUs                                    |
| Diagram engine              | **Mermaid only** for MVP                                                                   | Add Structurizr DSL post-MVP                                                                         |
| KB source-of-truth          | **YAML in repo**, PR-reviewed                                                              | Admin UI is a v1.x feature                                                                           |
| IaC                         | **Terraform (Google provider)**                                                            | Multi-cloud-portable; matches what we recommend                                                      |
| Auth                        | **Auth.js** for MVP; **Identity Platform** for enterprise tier later                       | Avoids Firebase/Identity Platform complexity at MVP                                                  |

---

## 10. Open Decisions To Confirm Before Build

1. **Pricing point** for the single MVP tier (need 5–10 willingness-to-pay conversations). Post ADR-0006, the defensible band is **₹1500–₹2500 per run** (or USD equivalent if the audience-currency decision lands on USD-first). Final number remains data-driven; locked before Phase 6 launch.
2. **Region:** `asia-south1` (Mumbai) vs `us-central1` vs `europe-west1` — driven by initial user geography and Vertex AI model availability for Gemini frontier + Claude.
3. **Google for Startups Cloud Program** eligibility — apply now; affects whether infra cost is essentially free for the first ~12 months.
4. **Eval bar:** the minimum aggregate eval score required before enabling paid checkout in prod.

_Once these four land, this spec is buildable as-is._
