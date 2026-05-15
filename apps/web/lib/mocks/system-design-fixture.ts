/**
 * Mock fixture for the ADR-0006 system-design narrative bundle.
 *
 * Five artifacts the architect / synthesizer / packager will emit at MVP:
 *   - sequenceDiagrams (write / read / async)
 *   - integrationContracts (per critical edge)
 *   - componentRationales ("fits because" per critical pick)
 *   - failureModes (with detection / recovery / RTO / RPO)
 *   - buildSequence (phased build order)
 *
 * Used by /design-system?internal=1 to preview the new sections, and by
 * the canned /decide demo until Phase 3 architect agent populates these
 * for real. See docs/adr/0006-expand-mvp-to-system-design-narrative.md.
 */

import type {
  BuildPhase,
  ComponentRationale,
  FailureMode,
  IntegrationContract,
  SequenceDiagram,
} from "@/lib/run-package";

/* ─── Sequence diagrams ────────────────────────────────────────── */

export const SAMPLE_SEQUENCE_DIAGRAMS: SequenceDiagram[] = [
  {
    id: "seq-write",
    kind: "write",
    title: "Create workflow run (write path)",
    summary:
      "Authenticated user submits a new workflow. Edge validates auth, app writes through the cache, and a job is enqueued for async processing.",
    participants: ["client", "lb", "app", "redis", "db", "pubsub"],
    mermaid: `sequenceDiagram
  autonumber
  participant C as Client
  participant E as LB + Cloud Armor
  participant A as App (Cloud Run)
  participant R as Redis (Memorystore)
  participant D as Postgres (Cloud SQL)
  participant Q as Pub/Sub
  C->>E: POST /workflows (cookie)
  E->>A: forward (mTLS)
  A->>D: BEGIN; INSERT workflow
  A->>R: SET cache:workflow:{id}
  A->>Q: publish workflow.created
  D-->>A: COMMIT
  A-->>C: 201 Created (id, ETag)`,
  },
  {
    id: "seq-read",
    kind: "read",
    title: "Read workflow detail (read path)",
    summary:
      "Read-heavy. Edge cache hits 70%; on miss app reads through Redis with stale-while-revalidate, falling back to a Postgres read replica.",
    participants: ["client", "lb", "cdn", "app", "redis", "db_replica"],
    mermaid: `sequenceDiagram
  autonumber
  participant C as Client
  participant CDN as Cloud CDN
  participant A as App (Cloud Run)
  participant R as Redis
  participant DR as Postgres (read replica)
  C->>CDN: GET /workflows/{id}
  alt CDN hit (70%)
    CDN-->>C: 200 (cached, ETag)
  else CDN miss
    CDN->>A: forward
    A->>R: GET cache:workflow:{id}
    alt Redis hit
      R-->>A: payload
    else Redis miss
      A->>DR: SELECT … WHERE id=$1
      DR-->>A: row
      A->>R: SETEX cache:workflow:{id} 300
    end
    A-->>CDN: 200 (Cache-Control: s-maxage=60, swr=300)
    CDN-->>C: 200
  end`,
  },
  {
    id: "seq-async",
    kind: "async",
    title: "Background workflow processing (async path)",
    summary:
      "Worker pulls from Pub/Sub, runs the LangGraph orchestrator, persists artifacts to Cloud Storage, and emits progress events to Redis Streams for SSE.",
    participants: ["pubsub", "worker", "llm", "gcs", "db", "redis"],
    mermaid: `sequenceDiagram
  autonumber
  participant Q as Pub/Sub (push)
  participant W as Worker (Cloud Run)
  participant L as Vertex AI Gemini
  participant G as Cloud Storage
  participant D as Postgres
  participant R as Redis Streams
  Q->>W: push workflow.created (OIDC)
  W->>D: SELECT FOR UPDATE; mark running
  W->>R: XADD progress phase=intake
  loop per agent (9×)
    W->>L: complete_structured(prompt, schema)
    L-->>W: validated payload
    W->>R: XADD progress phase=…
  end
  W->>G: PUT package.json / package.pdf
  W->>D: UPDATE run SET status=succeeded
  W->>R: XADD progress phase=done
  W-->>Q: 200 (ack)`,
  },
];

/* ─── Integration contracts ────────────────────────────────────── */

export const SAMPLE_INTEGRATION_CONTRACTS: IntegrationContract[] = [
  {
    edgeId: "app->pubsub:workflow.created",
    from: "app",
    to: "pubsub",
    mode: "async",
    payload: '{"runId": uuid, "userId": uuid, "tier": "standard", "schemaVersion": 1}',
    idempotency: "Pub/Sub message id + Stripe-style `Idempotency-Key: run-{id}-v1`",
    retry: "Pub/Sub redelivers up to 7 days; worker dedupes on (runId, schemaVersion).",
    semantics: "at-least-once",
    cite: 4,
  },
  {
    edgeId: "worker->db:run-state",
    from: "worker",
    to: "db",
    mode: "sync",
    payload: "UPDATE run SET status, progress_pct, current_agent WHERE id=$1",
    idempotency: "Optimistic lock on `run.version`; CAS retry on conflict (max 3).",
    retry: "Connection retry with exponential backoff (50ms → 1s, max 5).",
    semantics: "exactly-once",
    cite: 12,
  },
  {
    edgeId: "worker->gcs:package",
    from: "worker",
    to: "gcs",
    mode: "sync",
    payload: "package.json (≤2MB), package.pdf (≤8MB), package.md (≤500KB)",
    idempotency: "Object name = `runs/{id}/package.{ext}`; PUT is idempotent by path.",
    retry: "Resumable upload; 3 attempts with backoff. On final failure, mark run failed.",
    semantics: "exactly-once",
    cite: 7,
  },
  {
    edgeId: "stripe->web:webhook",
    from: "stripe",
    to: "app",
    mode: "async",
    payload: "checkout.session.completed → enqueue paid run on Pub/Sub",
    idempotency: "Stripe `event.id` stored in `processed_events`; duplicate posts return 200.",
    retry: "Stripe retries up to 3 days; webhook returns 2xx after persisting event.",
    semantics: "at-least-once",
    cite: 19,
  },
];

/* ─── Component rationales ─────────────────────────────────────── */

export const SAMPLE_COMPONENT_RATIONALES: ComponentRationale[] = [
  {
    nodeId: "app",
    requirementId: "req-scale",
    narrative:
      "Cloud Run fits because the workload is bursty (5k MAU at launch, 10× spikes during business hours) and stateless per request. Min-instances=1 avoids cold starts on the critical-path POST; concurrency=80 keeps cost low. Reverting to GKE is a 2-week lift if we hit Cloud Run's 32GB/instance ceiling.",
    cite: 4,
  },
  {
    nodeId: "db",
    requirementId: "req-residency",
    narrative:
      "Cloud SQL Postgres 16 fits because EU data residency is a hard constraint (single-region in europe-west1), pgvector handles the KB embedding store in one DB, and PITR + automated backups satisfy the SOC 2 RPO target. Spanner is rejected — ~5× cost for this workload size, and no regional pgvector story.",
    cite: 12,
  },
  {
    nodeId: "redis",
    requirementId: "req-latency",
    narrative:
      "Memorystore Redis Basic fits because cache + Pub/Sub-style progress streams need sub-ms p95, not durability. Basic tier (1GB) is enough for the cache footprint; we promote to Standard HA only after the first paying customer with an uptime SLA.",
    cite: 8,
  },
  {
    nodeId: "pubsub",
    requirementId: "req-async",
    narrative:
      "Pub/Sub fits because the worker pool scales independently of the web tier and we need durable handoff with OIDC-verified push subscriptions. Cloud Tasks was considered but lacks fan-out for the per-agent progress stream we'll need at v1.1.",
    cite: 4,
  },
  {
    nodeId: "lb",
    requirementId: "req-security",
    narrative:
      "Global External HTTPS LB + Cloud Armor fits because Stripe webhooks and authenticated traffic must terminate TLS at one edge, with WAF (OWASP CRS) in front. Cloud Run direct ingress would skip Armor entirely.",
    cite: 23,
  },
];

/* ─── Failure modes ────────────────────────────────────────────── */

export const SAMPLE_FAILURE_MODES: FailureMode[] = [
  {
    id: "fm-llm-outage",
    nodeId: "app",
    mode: "Vertex AI Gemini 5xx / quota exhausted on a critical agent",
    detection:
      "OTEL span `tessar.agent.{name}` error rate > 5% over 1 min; Sentry alert; per-run budget check.",
    recovery:
      "LLM router falls back to Claude-on-Vertex automatically. If both fail, run is marked failed, user is auto-refunded via Stripe API, on-call paged.",
    rto: "60s (router fallback) · 24h (full provider outage refund flow)",
    rpo: "0 (no data loss; brief and intermediate state persisted)",
    cite: 4,
  },
  {
    id: "fm-db-failover",
    nodeId: "db",
    mode: "Cloud SQL primary instance failure",
    detection: "Cloud SQL HA health check; OTEL DB connection errors; uptime probe alert.",
    recovery:
      "Automatic failover to standby (HA enabled). In-flight writes fail and retry on the new primary. PITR available to any point in last 7 days.",
    rto: "≤120s (HA failover)",
    rpo: "≤5s (synchronous replication to standby)",
    cite: 12,
  },
  {
    id: "fm-pubsub-backlog",
    nodeId: "pubsub",
    mode: "Worker fleet stuck; Pub/Sub backlog grows unbounded",
    detection:
      "Cloud Monitoring alert: `subscription/oldest_unacked_message_age` > 10 min on `tessar-runs`.",
    recovery:
      "Scale worker min-instances; if poison message, runbook routes to DLQ + manual replay. Auto-refund any run whose ack age exceeds 60 min.",
    rto: "10 min (scale-up) · 60 min (DLQ triage)",
    rpo: "0 (messages durable until acked)",
    cite: 4,
  },
  {
    id: "fm-gcs-region",
    nodeId: "app",
    mode: "Cloud Storage regional outage during package upload",
    detection: "Resumable upload retries exhausted; OTEL span `gcs.put` final failure.",
    recovery:
      "Run marked failed, auto-refunded. Package re-render is idempotent — user can retry once region recovers.",
    rto: "Bound by GCS regional recovery (typically <2h)",
    rpo: "0 (run state in Postgres, not GCS)",
    cite: 7,
  },
  {
    id: "fm-stripe-webhook",
    nodeId: "app",
    mode: "Stripe webhook delivery delayed / dropped after successful payment",
    detection:
      "Run stuck in `paymentStatus=pending` > 10 min after checkout redirect; reconciliation job cross-checks Stripe API.",
    recovery:
      "Reconciliation cron pulls Stripe events for last 24h and replays missed `checkout.session.completed`. Idempotent on `processed_events.event_id`.",
    rto: "≤15 min (cron interval)",
    rpo: "0 (Stripe is source of truth)",
    cite: 19,
  },
];

/* ─── Build sequence ───────────────────────────────────────────── */

export const SAMPLE_BUILD_SEQUENCE: BuildPhase[] = [
  {
    id: "phase-1",
    label: "Phase 1",
    title: "Single-tenant slice (1× scale)",
    nodes: ["client", "lb", "app", "db", "redis"],
    rationale:
      "Ship the smallest end-to-end surface that validates the workflow contract: web → app → DB, with Redis only as a session cache. Defer Pub/Sub, async workers, CDN — they exist as stubs but carry no traffic yet. Lets the first 5 design partners use the product within 2 weeks.",
  },
  {
    id: "phase-2",
    label: "Phase 2",
    title: "Async + observability (10× scale)",
    nodes: ["pubsub", "worker", "gcs", "otel", "sentry"],
    rationale:
      "Add the worker tier and Pub/Sub. Wire OTEL → Cloud Trace and Sentry on both services. This is when long-running work moves off the request path and the read/write/async sequence diagrams above become real.",
  },
  {
    id: "phase-3",
    label: "Phase 3",
    title: "Edge + WAF + CDN (100× scale)",
    nodes: ["cdn", "armor", "db_replica"],
    rationale:
      "Attach Cloud Armor (OWASP CRS) to the LB, enable Cloud CDN on read paths, and add a Cloud SQL read replica when read QPS exceeds 200/s sustained. Also when SOC 2 audit work begins, since the WAF + edge logs are evidence inputs.",
  },
  {
    id: "phase-4",
    label: "Phase 4",
    title: "Multi-region & DR (post-launch)",
    nodes: ["db_replica_dr", "gcs_multiregion"],
    rationale:
      "Triggered by the first enterprise contract that requires a documented DR plan. Promote DB to multi-region, store package artifacts in a multi-region bucket, and run a quarterly restore drill. Until then, single-region + PITR is the right cost/risk trade-off.",
  },
];
