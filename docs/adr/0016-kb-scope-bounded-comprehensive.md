# ADR-0016: KB Scope — Bounded Comprehensive (not "all components in the world")

- **Status:** Accepted
- **Date:** 2026-05-18
- **Deciders:** founder

## Context

User request: "KB should not just be 40 components, we should include all possible components and info from the world."

Direct execution of that request is wrong for three locked-rule reasons:

1. **`architecture.instructions.md`:** _"KB freshness SLA 90 days per record."_ An unbounded KB cannot meet this SLA — every record rots, the re-verification job becomes unbounded, the cost of staleness exceeds the value of coverage.
2. **`architecture.instructions.md`:** _"Source of truth: YAML in `kb-seed/`, PR-reviewed."_ Every KB record requires human review. Unbounded volume defeats this gate; "all the components in the world" cannot be PR-reviewed at any sustainable rate.
3. **`product-goals.instructions.md`:** MVP domain is _"SaaS web applications (B2B/B2C). Do not expand domain scope inside MVP work."_ and _"Recommendation cloud: GCP first (full BOM + cost), AWS + Azure secondary (component list, no full cost)."_ A KB covering ML-ops, IoT, embedded, gaming, on-prem hardware, etc. is out of scope.

The correct interpretation: "**comprehensive coverage of the components a SaaS-web-app architect would actually choose between**". That is bounded, knowable, and reviewable.

## Decision

KB MVP target raised from the original ~150 records to **~300 records**, distributed as follows:

### `kb_components` (target: ~270 records)

| Bucket                                             | Target   | Notes                                                                                                                                                                                                  |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GCP — compute                                      | 15       | Cloud Run, Cloud Run Jobs, GKE Autopilot, GCE, App Engine Standard/Flex, Cloud Functions (gen 2), Batch, Workflows, etc.                                                                               |
| GCP — data (relational/NoSQL/cache/search)         | 25       | Cloud SQL Postgres/MySQL/SQL Server, AlloyDB, Spanner, Firestore, Bigtable, Memorystore Redis/Valkey/Memcached, BigQuery, Vertex AI Vector Search, etc.                                                |
| GCP — storage / messaging / streaming              | 15       | GCS, Filestore, Pub/Sub, Cloud Tasks, Eventarc, Dataflow, Pub/Sub Lite, etc.                                                                                                                           |
| GCP — networking / security / edge                 | 25       | Global LB, Cloud CDN, Cloud Armor, Cloud Run Domain Mappings, Cloud DNS, VPC, Private Service Connect, Identity-Aware Proxy, IAM, Secret Manager, KMS, Certificate Manager, Binary Authorization, etc. |
| GCP — observability / devops                       | 15       | Cloud Logging, Cloud Trace, Cloud Monitoring, Cloud Profiler, Error Reporting, Cloud Build, Artifact Registry, Cloud Deploy, Cloud Workstations, etc.                                                  |
| GCP — AI / ML                                      | 10       | Vertex AI Gemini/Claude/Llama, Vertex AI Search, AutoML, Document AI, Speech, Vision, Translation, Discovery Engine.                                                                                   |
| **GCP subtotal**                                   | **~105** | **Full BOM + cost — primary recommendation cloud.**                                                                                                                                                    |
| AWS — equivalents                                  | 50       | One entry per GCP component with a non-trivial AWS equivalent. Component list + capability summary + pricing-model class only (no cost numbers — per `product-goals.instructions.md`).                 |
| Azure — equivalents                                | 50       | Same shape as AWS.                                                                                                                                                                                     |
| Third-party SaaS — auth                            | 8        | Auth0, Clerk, Supabase Auth, Firebase Auth, WorkOS, Stytch, FusionAuth, Ory.                                                                                                                           |
| Third-party SaaS — payments                        | 6        | Razorpay (per ADR-0014), Stripe, PayU, Paddle, Lemon Squeezy, Cashfree.                                                                                                                                |
| Third-party SaaS — email / notif                   | 8        | Resend, Postmark, SendGrid, Mailgun, Loops, AWS SES (alt-cloud convenience), Twilio (SMS), Knock.                                                                                                      |
| Third-party SaaS — observability                   | 12       | Sentry, Datadog, Grafana Cloud, New Relic, Honeycomb, Logtail/Better Stack, Highlight, PostHog (overlaps analytics), Axiom, Splunk, Dynatrace, Dash0.                                                  |
| Third-party SaaS — feature flags / experimentation | 5        | LaunchDarkly, Unleash, ConfigCat, Statsig, GrowthBook.                                                                                                                                                 |
| Third-party SaaS — analytics                       | 6        | PostHog, Amplitude, Mixpanel, Segment, June, Heap.                                                                                                                                                     |
| Third-party SaaS — search / vector                 | 8        | Algolia, Meilisearch, Typesense, Elastic Cloud, Pinecone, Weaviate, Qdrant, Turbopuffer.                                                                                                               |
| Third-party SaaS — CDN / edge                      | 6        | Cloudflare (CDN + Workers + R2), Fastly, Akamai, Bunny.net, Vercel Edge, Netlify Edge.                                                                                                                 |
| Third-party SaaS — auth-adjacent / billing         | 6        | Stripe Billing (subs), Chargebee, Recurly, OpenMeter, Lago, Metronome.                                                                                                                                 |
| **Third-party SaaS subtotal**                      | **~65**  | Bias toward what an Indian-headquartered SaaS-web-app team actually evaluates in 2026.                                                                                                                 |

### `kb_patterns` (target: 30 records)

Examples (final list curated): single-region multi-AZ, multi-region active-passive, multi-region active-active, read-replica + write-primary, write-through cache, write-behind cache, CQRS, event-sourcing, outbox, saga, materialized views, async export via Pub/Sub + Cloud Run, websocket-with-fanout, SSE-with-pubsub, BFF, edge SSR, ISR/static-revalidate, blue-green deploy, canary deploy, feature-flag-gated rollout, dark-launch, shadow traffic, leader election via Spanner/Postgres, idempotent webhook receiver, OIDC-verified pub/sub push, hot/cold storage tiering, vector-RAG, hybrid-search (BM25+vector), prompt-caching, multi-tenant row-level-security, multi-tenant schema-per-tenant.

### `kb_reference_archs` (target: 15 records)

- Solo-founder SaaS (≤100 users)
- Growth-stage B2B SaaS (1k–10k tenants, multi-region read scale)
- Consumer B2C SaaS (high-write, viral-spike-capable)
- Marketplace (two-sided, search-heavy)
- Vertical SaaS with compliance (HIPAA-adjacent / SOC 2)
- AI-native SaaS (LLM-in-the-loop, vector store, RAG)
- Internal-tools SaaS (low traffic, high integration count)
- Data-product SaaS (BigQuery + reverse-ETL)
- Real-time collab SaaS (websocket-heavy, CRDT)
- E-commerce SaaS (cart + payments + inventory)
- Subscription SaaS (recurring billing + dunning)
- Multi-tenant white-label SaaS
- Edge-rendered SaaS (Next.js on Vercel + GCP backend)
- Mobile-first SaaS (BaaS-like)
- Workflow / automation SaaS (Zapier-class)

### Out of scope (do NOT add to KB even if "available in the world")

- Embedded / IoT components
- Gaming engines / game-backend specifics
- HPC / scientific computing
- On-prem hardware
- Bare-metal infrastructure
- ML training pipelines for foundation models
- Crypto / web3 infra
- Telco-specific (5G NF, SBC)
- ERP / accounting domain-specific (SAP, NetSuite)

These can be added post-MVP if/when domain scope expands per `product-goals.instructions.md` change process (new ADR + MVP.md §1 update).

## Production approach (how we get to ~300 records without breaking PR-review)

1. **Schema-first.** [apps/orchestrator/tessar/kb/schema.py](../../apps/orchestrator/tessar/kb/schema.py) defines the YAML schema. All new records must validate against it before commit (CI gate already exists per `.github/workflows/pr.yml`).
2. **Bucket-by-bucket PRs.** Each bucket above is one PR (e.g. "GCP-compute 15 records"). Reviewer can hold the whole bucket in head at once. Average bucket PR ≈ 10–25 records. No PR exceeds 30 records.
3. **Source-of-truth links in every record.** Every YAML record's `sources[]` field includes at least 2 authoritative links (vendor docs + at least one independent reference) with `verified_at` timestamps. The freshness SLA job hashes the vendor page; SLA breach = automatic issue.
4. **AI-assisted drafting allowed, human review mandatory.** Drafting a YAML record from vendor docs is fine to do with an LLM. The PR-review gate is non-negotiable. Reviewer signs off on: schema compliance, sources reachable, capability summary correct, pricing-model class correct, regions list correct, compliance flags correct.
5. **Auto-generated records flagged.** Any record drafted with LLM assistance is tagged `provenance: "llm-assisted"` so the freshness job can prioritise re-verification.
6. **No silent additions.** Adding a record outside an approved bucket requires updating this ADR's bucket table.

## Cadence

- Bucket-PR rate: 2–4 buckets per week sustained. ~300 records reachable in 8–12 weeks of part-time curation work. This is Phase-3a / 3-continuous work; no other Phase-3 item is blocked by KB count being below target (hybrid retrieval can be built and tested against 50 records as well as 300).
- Re-verification job runs weekly per architecture.instructions.md. Records with `verified_at > 90d` are flagged in the dashboard; PR to refresh is opened automatically with the diff.

## Alternatives Considered

- **Original ~150 target.** Achievable faster (~4 weeks part-time). Rejected because today's `cmpb2i5` failure was partly KB starvation — the architect couldn't pick a defensible queueing pattern because no `kb_patterns` records exist. 30 patterns is roughly the minimum that lets the synthesizer/architect have real choice.
- **"All components in the world" (user's literal ask).** Rejected per the three locked-rule reasons in the Context section above. Unbounded scope = unbounded freshness debt = product trust collapses within months.
- **Defer KB growth, fix retrieval first.** Tempting (retrieval is cheaper). Rejected because retrieval against 10 components is uninteresting; we can't meaningfully validate the retrieval ranking until KB is ≥50 records.

## Consequences

### What becomes easier

- Architect / synthesizer admissibility failure rate drops as KB coverage of common SaaS patterns becomes real.
- "Every component pick traces to a KB record" (product-goals trust requirement) becomes achievable rather than aspirational.
- Multi-cloud component list (AWS/Azure equivalents) lets the package output meet the MVP scope honestly.

### What becomes harder

- 8–12 weeks of curation work, parallel to other Phase-3 work. Founder bandwidth is the rate-limiter.
- Re-verification job's caseload triples vs original 150 target. The job is already implemented but its dashboards must be reviewed weekly to avoid drift.
- Each new third-party SaaS record carries vendor-relationship risk (pricing changes, deprecations, acquisitions). The provenance flag + 90-day SLA absorb most of this.

### Follow-up work this ADR triggers

- **In-repo doc updates** (atomic with this ADR):
  - `MVP.md` §1.1 KB count phrase, §3.7 KB record count.
  - `kb-seed/README.md` — bucket table + curation cadence.
- **Code work** (separate PRs):
  - `kb-seed/components/` — bucket-by-bucket PRs (per Production approach §2).
  - `kb-seed/patterns/` — new directory; 30 records.
  - `kb-seed/reference-architectures/` — new directory; 15 records.
  - Hybrid retrieval (BM25 `tsvector` + `pgvector`) — separate ADR-deferred work item, tracked in Phase-3a continuation.
- **Operational** (founder):
  - Block 4 hours/week for KB review until target reached.
  - Set up the weekly re-verification job alerting (already exists per architecture rules; just needs Slack/email destination).

## References

- [MVP.md](../../MVP.md) §1.2, §3.7
- `.github/instructions/architecture.instructions.md` (KB rules)
- `.github/instructions/product-goals.instructions.md` (MVP domain anchor)
- [ADR-0004: design-lock agent output contract](./0004-design-lock-agent-output-contract.md)
- [kb-seed/README.md](../../kb-seed/README.md)
