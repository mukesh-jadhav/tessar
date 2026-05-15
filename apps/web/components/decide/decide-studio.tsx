"use client";

import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SAMPLE_PACKAGES, getSample, type SampleId } from "@/lib/mocks/sample-packages";
import { springs } from "@/lib/motion/springs";

const expressiveDefault = springs.expressiveDefault;
const expressiveFast = springs.expressiveFast;

/* ---------------------------------------------------------------------------
 * /decide \u2014 The TESSAR workspace. Single viewport, no scroll.
 *
 * Layout grid (lg+):
 *   ┌───────────────────────────────────────────────────────────────────┐
 *   │ ✓ TESSAR  · brief title          · phase: Architecting · 7m12s    │
 *   ├──────────────┬─────────────────────────────────────┬──────────────┤
 *   │              │                                     │              │
 *   │  BRIEF       │      LIVE ARCHITECTURE              │   DECISIONS  │
 *   │  composer    │      diagram fills center           │   + sources  │
 *   │  (left)      │      with animated layers           │   (right)    │
 *   │              │                                     │              │
 *   └──────────────┴─────────────────────────────────────┴──────────────┘
 *   ┌───────────────────────────────────────────────────────────────────┐
 *   │ progress timeline · 9 nodes lit as agents complete · cost so far  │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 * Interaction model:
 *   1. Idle    \u2014 brief composer is editable, diagram shows ghost outlines.
 *   2. Running \u2014 user clicked "Run". Phases tick through, diagram populates
 *                  layer by layer with springs, decisions stream into the
 *                  right column.
 *   3. Done    \u2014 final architecture rendered, decisions complete, CTA to
 *                  download PDF / .md.
 *
 * Mocked: the run is local-state driven \u2014 no backend yet (per Phase-1 build
 * philosophy in implementation-discipline). Real Service Bus + SSE arrive in
 * Phase 2.
 * ------------------------------------------------------------------------- */

type Phase =
  | "intake"
  | "requirements"
  | "research_plan"
  | "research_workers"
  | "synthesizer"
  | "architect"
  | "cost"
  | "risk"
  | "packager";

const PHASES: Array<{ id: Phase; label: string; brief: string }> = [
  { id: "intake", label: "Intake", brief: "Normalising your brief" },
  { id: "requirements", label: "Requirements", brief: "Pulling functional + non-functional" },
  { id: "research_plan", label: "Research plan", brief: "Picking the questions to ask" },
  { id: "research_workers", label: "Research workers", brief: "3 in parallel · web + KB" },
  { id: "synthesizer", label: "Synthesiser", brief: "Cross-checking claims" },
  { id: "architect", label: "Architect", brief: "Naming components" },
  { id: "cost", label: "Cost", brief: "Modelling at 1×, 10×, 100×" },
  { id: "risk", label: "Risk + trade-offs", brief: "Flagging what breaks first" },
  { id: "packager", label: "Packager", brief: "Assembling MD + PDF" },
];

/** Architecture nodes positioned in a 100×100 canvas. Nodes belong to a
 *  visual zone (edge / app / data / external) so the diagram reads like a
 *  proper system architecture — not just stacked component cards.
 *
 *  Each node also carries the reasoning the user is paying for: a one-line
 *  `why` (the picked-over-alternatives rationale) and `scale` (1× / 10× /
 *  100× behavior), surfaced when the node is focused.                     */
type Zone = "client" | "edge" | "app" | "data" | "external";
type ArchNode = {
  id: string;
  label: string;
  sub: string;
  zone: Zone;
  /** % of canvas width — center of the card */
  x: number;
  /** % of canvas height — center of the card */
  y: number;
  /** card width in % of canvas */
  w: number;
  cite: number;
  appearsAt: Phase;
  icon:
    | "user"
    | "shield"
    | "globe"
    | "cpu"
    | "queue"
    | "flash"
    | "db"
    | "bucket"
    | "sparkle"
    | "card";
  /** Short, inline scaling chip shown on the card when there's room. */
  scaleChip?: string;
  /** One-line rationale shown in the focus panel. */
  why?: string;
  /** Scaling behavior across load tiers, shown in the focus panel. */
  scale?: { tier: "1×" | "10×" | "100×"; note: string }[];
  /** Alternatives considered (and rejected). */
  alts?: string;
  /** Data classification — drives a colored dot on the card. */
  dataClass?: "pii" | "secret" | "payment" | "public" | "internal";
  /** Other node ids that go dark if this one fails. */
  failureDomain?: string[];
};

const NODES: ArchNode[] = [
  {
    id: "user",
    label: "End user",
    sub: "Browser · SSE listener",
    zone: "client",
    x: 50,
    y: 8,
    w: 22,
    cite: 1,
    appearsAt: "intake",
    icon: "user",
    dataClass: "public",
    failureDomain: [],
    why: "SSE streamed from /api/runs/:id keeps the dashboard live with one TCP connection — no WebSocket infra to operate.",
    scale: [
      { tier: "1×", note: "≤ 50 concurrent viewers / instance" },
      { tier: "10×", note: "Container Apps scale horizontally; SSE pinned via session affinity" },
      { tier: "100×", note: "Move to Service Bus fan-out + dedicated stream service" },
    ],
    alts: "WebSockets · long-poll",
  },
  {
    id: "lb",
    label: "Front Door + WAF",
    sub: "TLS · WAF · CDN",
    zone: "edge",
    x: 50,
    y: 24,
    w: 30,
    cite: 2,
    appearsAt: "architect",
    icon: "shield",
    scaleChip: "10k RPS",
    dataClass: "public",
    failureDomain: ["web", "worker", "queue", "redis", "db", "storage", "vertex", "stripe"],
    why: "Azure Front Door Premium gives global anycast + managed WAF + CDN in one hop — no extra vendor, deep Azure-AD integration.",
    scale: [
      { tier: "1×", note: "Standard SKU · ~200 RPS baseline" },
      { tier: "10×", note: "Premium SKU $330/mo + $0.087/GB egress" },
      { tier: "100×", note: "Add WAF bot-manager rule set ($30/policy/mo)" },
    ],
    alts: "Cloudflare · AWS CloudFront",
  },
  {
    id: "web",
    label: "tessar-web",
    sub: "Next.js 15 · Container Apps",
    zone: "app",
    x: 25,
    y: 46,
    w: 26,
    cite: 3,
    appearsAt: "architect",
    icon: "globe",
    scaleChip: "min 1 · max 100",
    dataClass: "internal",
    failureDomain: ["queue"],
    why: "Azure Container Apps = container ergonomics + scale-to-zero economics + Next.js 15 streaming SSR works out of the box, KEDA scales on RPS.",
    scale: [
      { tier: "1×", note: "min 1 replica · 0.5 vCPU · 1 GiB" },
      { tier: "10×", note: "KEDA auto-scales to ~12 replicas on concurrency=80" },
      { tier: "100×", note: "Dedicated workload profile; warm pool of 5; pin region" },
    ],
    alts: "AKS · App Service · Vercel",
  },
  {
    id: "worker",
    label: "tessar-orchestrator",
    sub: "LangGraph · Python 3.12",
    zone: "app",
    x: 75,
    y: 46,
    w: 26,
    cite: 4,
    appearsAt: "architect",
    icon: "cpu",
    scaleChip: "concurrency 1 · 60min",
    dataClass: "internal",
    failureDomain: [],
    why: "Container Apps job with concurrency=1 makes each run a clean process — no shared LangGraph state. 60-min timeout fits the 12-min target with headroom.",
    scale: [
      { tier: "1×", note: "min 0 · ~30 runs/day" },
      { tier: "10×", note: "min 0, max 50 — Service Bus buffers spikes" },
      { tier: "100×", note: "Reserve 10 warm; shard runs by tenant for cache locality" },
    ],
    alts: "Azure Functions (Premium · 60min) · AKS Job",
  },
  {
    id: "queue",
    label: "Service Bus",
    sub: "runs queue · managed identity",
    zone: "app",
    x: 50,
    y: 64,
    w: 22,
    cite: 5,
    appearsAt: "architect",
    icon: "queue",
    scaleChip: "DLQ + sessions",
    dataClass: "internal",
    failureDomain: ["worker"],
    why: "Service Bus Standard with managed-identity auth — no shared secret. Built-in DLQ + 5× retry ladder give us safe at-least-once delivery.",
    scale: [
      { tier: "1×", note: "Standard · $10/mo base + $0.05/M ops" },
      { tier: "10×", note: "~$45/mo at projected message volume" },
      {
        tier: "100×",
        note: "Premium messaging · move lock duration to 5 min; partition queues per tenant",
      },
    ],
    alts: "Storage Queues · Event Grid",
  },
  {
    id: "redis",
    label: "Azure Cache for Redis",
    sub: "SSE stream · cache",
    zone: "app",
    x: 82,
    y: 64,
    w: 22,
    cite: 6,
    appearsAt: "architect",
    icon: "flash",
    scaleChip: "Basic C0 · 250 MB",
    dataClass: "internal",
    failureDomain: [],
    why: "Streams power the SSE replay buffer; same instance caches prompt + retrieval results keyed by KB snapshot.",
    scale: [
      { tier: "1×", note: "Basic C0 · 250 MB · $17/mo · single AZ" },
      { tier: "10×", note: "Standard C2 6 GB · $290/mo · primary + replica" },
      { tier: "100×", note: "Premium P1 cluster · 6 GB × 4 shards · or move stream to Event Hubs" },
    ],
    alts: "Upstash · Postgres LISTEN/NOTIFY",
  },
  {
    id: "db",
    label: "Azure DB · Postgres 16",
    sub: "Flexible Server · pgvector",
    zone: "data",
    x: 30,
    y: 86,
    w: 26,
    cite: 7,
    appearsAt: "cost",
    icon: "db",
    scaleChip: "B1ms → D2s v5",
    dataClass: "pii",
    failureDomain: ["web", "worker"],
    why: "One DB for relational + vectors at MVP scale. Cosmos DB for Postgres (Citus) only wins above ~5 TB or > 5k QPS — neither true for 12-min jobs.",
    scale: [
      { tier: "1×", note: "Burstable B1ms · 1 vCPU · 2 GiB · $14/mo" },
      { tier: "10×", note: "D2s v5 · 2 vCPU · 8 GiB · $145/mo + 1 read replica" },
      { tier: "100×", note: "Migrate to Cosmos DB for Postgres (Citus); partition runs by month" },
    ],
    alts: "Cosmos DB for Postgres · Cosmos DB · Azure SQL",
  },
  {
    id: "storage",
    label: "Azure Blob Storage",
    sub: "SAS URLs · Cool tier 30d",
    zone: "data",
    x: 70,
    y: 86,
    w: 26,
    cite: 8,
    appearsAt: "cost",
    icon: "bucket",
    scaleChip: "Hot → Cool 30d",
    dataClass: "internal",
    failureDomain: [],
    why: "User-delegated SAS URLs let the browser download PDFs directly — no proxy bandwidth. Lifecycle to Cool tier drops cost 50% after 30 d.",
    scale: [
      { tier: "1×", note: "$0.018/GB Hot · ~$2/mo for 100 GB" },
      { tier: "10×", note: "Lifecycle to Cool saves $0.008/GB/mo" },
      { tier: "100×", note: "Add Front Door SAS-URL caching for sample packages" },
    ],
    alts: "S3 · R2",
  },
  {
    id: "vertex",
    label: "Azure OpenAI",
    sub: "GPT-5 · GPT-4o-mini",
    zone: "external",
    x: 18,
    y: 64,
    w: 22,
    cite: 4,
    appearsAt: "research_workers",
    icon: "sparkle",
    scaleChip: "Tier-A frontier · Tier-B mini",
    dataClass: "internal",
    failureDomain: ["worker"],
    why: "GPT-4o-mini for tier-B research workers (cheap, fast); GPT-5 for synthesis + architect (quality bar). Claude on Azure AI Foundry is the failover — same data-residency boundary.",
    scale: [
      { tier: "1×", note: "$0.10–$0.40 / run depending on tier mix · PAYG" },
      { tier: "10×", note: "Aggressive prompt + retrieval caching cuts spend ~35%" },
      { tier: "100×", note: "PTU (Provisioned Throughput Units) reserved capacity" },
    ],
    alts: "Anthropic on Foundry · OpenAI direct",
  },
  {
    id: "stripe",
    label: "Stripe",
    sub: "Checkout + webhooks",
    zone: "external",
    x: 8,
    y: 24,
    w: 14,
    cite: 8,
    appearsAt: "packager",
    icon: "card",
    scaleChip: "2.9% + 30¢",
    dataClass: "payment",
    failureDomain: [],
    why: "Pay-per-run = single Checkout session per brief. Webhooks signature-verified; idempotency keys on every credit grant.",
    scale: [
      { tier: "1×", note: "Standard pricing — no minimum" },
      { tier: "10×", note: "Negotiate volume tier at $250k GMV/mo" },
      { tier: "100×", note: "Move to Stripe Billing for usage-metered tiers" },
    ],
    alts: "Lemon Squeezy · Paddle",
  },
];

/* ─── Tweak system ──────────────────────────────────────────────
 *
 * Real teams have real constraints — "we don't run Redis", "no managed LLMs",
 * "must be multi-AZ". COMPONENT_OPTIONS lets the user swap individual nodes
 * for alternatives the agent considered, and ORG_CONSTRAINTS lets them apply
 * org-level toggles that fan out to several nodes at once. Both feed the same
 * `effectiveNodes` / `effectiveBom` derivation so the diagram, BOM, totals,
 * and inspectors all reflect the user's tweaks live.
 *
 * costMul = multiplier applied to that node's BOM line cost.
 * remove  = node disappears from the diagram entirely.
 * note    = inspector hint shown when this option is selected.
 */
type ComponentOption = {
  id: string;
  label: string;
  sub: string;
  costMul: number;
  remove?: boolean;
  note: string;
};
const COMPONENT_OPTIONS: Record<string, ComponentOption[]> = {
  redis: [
    {
      id: "redis-default",
      label: "Azure Cache for Redis",
      sub: "Basic C0 · 250 MB",
      costMul: 1,
      note: "Default. Streams power SSE replay; same instance caches prompts.",
    },
    {
      id: "redis-upstash",
      label: "Upstash Redis (serverless)",
      sub: "pay-per-request",
      costMul: 0.45,
      note: "Cheaper at low volume; per-request billing. No private endpoint — TLS only.",
    },
    {
      id: "redis-pg",
      label: "Postgres LISTEN/NOTIFY",
      sub: "no separate cache tier",
      costMul: 0,
      remove: true,
      note: "Drops Redis entirely. SSE replay handled by `run_events` table; cache misses go to Postgres. -1 vendor.",
    },
    {
      id: "redis-dragonfly",
      label: "DragonflyDB on AKS",
      sub: "self-hosted · 2 GiB",
      costMul: 1.4,
      note: "Higher throughput per core. Adds AKS as an operational dependency.",
    },
  ],
  db: [
    {
      id: "db-default",
      label: "Azure DB · Postgres 16",
      sub: "Flexible Server · pgvector",
      costMul: 1,
      note: "Default. One DB for relational + vectors. Right-sized for MVP.",
    },
    {
      id: "db-cosmos",
      label: "Cosmos DB for Postgres",
      sub: "Citus · sharded",
      costMul: 4.6,
      note: "Picks up at >5 TB or >5k QPS. Adds operational complexity now.",
    },
    {
      id: "db-rds",
      label: "AWS RDS Postgres",
      sub: "Multi-AZ · cross-cloud",
      costMul: 1.3,
      note: "Cross-cloud. Adds egress cost and managed-identity gymnastics.",
    },
    {
      id: "db-self",
      label: "Self-hosted Postgres",
      sub: "AKS · zalando-postgres-operator",
      costMul: 0.55,
      note: "Cheapest by infra; expensive by ops time. Needs an on-call rotation.",
    },
  ],
  queue: [
    {
      id: "q-default",
      label: "Service Bus",
      sub: "Standard · DLQ + sessions",
      costMul: 1,
      note: "Default. Managed-identity auth, DLQ + 5× retry ladder.",
    },
    {
      id: "q-storage",
      label: "Storage Queues",
      sub: "simple · cheap",
      costMul: 0.15,
      note: "10× cheaper, 64 KB message limit, no sessions, weaker DLQ semantics.",
    },
    {
      id: "q-eventgrid",
      label: "Event Grid",
      sub: "push-only · pub/sub",
      costMul: 0.6,
      note: "Push-only. Better for fan-out events than long-running job pulls.",
    },
    {
      id: "q-sqs",
      label: "AWS SQS",
      sub: "cross-cloud · proven",
      costMul: 0.9,
      note: "Cross-cloud. Familiar semantics; egress cost on every consume.",
    },
    {
      id: "q-kafka",
      label: "Confluent Kafka",
      sub: "streaming · replay",
      costMul: 3.8,
      note: "Massively over-provisioned for 30 messages/hour. Pick if you need replay.",
    },
  ],
  vertex: [
    {
      id: "llm-default",
      label: "Azure OpenAI",
      sub: "GPT-5 · GPT-4o-mini",
      costMul: 1,
      note: "Default. Same data-residency boundary; PTU available at 100×.",
    },
    {
      id: "llm-anthropic",
      label: "Anthropic on Foundry",
      sub: "Claude 4.5 Sonnet",
      costMul: 1.25,
      note: "Stronger reasoning, slightly higher per-token cost. Same boundary.",
    },
    {
      id: "llm-bedrock",
      label: "AWS Bedrock",
      sub: "cross-cloud · multi-model",
      costMul: 1.1,
      note: "Multi-model menu. Cross-cloud egress applies.",
    },
    {
      id: "llm-vllm",
      label: "Self-hosted vLLM",
      sub: "AKS · Llama 3.3 70B",
      costMul: 2.4,
      note: "Predictable spend, capacity-bound. Quality lower than frontier closed models.",
    },
    {
      id: "llm-openai",
      label: "OpenAI direct",
      sub: "outside Azure boundary",
      costMul: 1.05,
      note: "Skips the Azure data plane — fails strict EU residency.",
    },
  ],
  web: [
    {
      id: "web-default",
      label: "tessar-web",
      sub: "Next.js 15 · Container Apps",
      costMul: 1,
      note: "Default. Scale-to-N via KEDA on concurrency.",
    },
    {
      id: "web-aks",
      label: "tessar-web on AKS",
      sub: "Next.js 15 · K8s deploy",
      costMul: 1.7,
      note: "Full K8s control. Adds an AKS bill + operational ownership.",
    },
    {
      id: "web-appsvc",
      label: "Azure App Service",
      sub: "Premium v3 P1v3",
      costMul: 1.35,
      note: "Simpler deploy story; no scale-to-zero.",
    },
    {
      id: "web-vercel",
      label: "Vercel",
      sub: "managed Next.js host",
      costMul: 0.9,
      note: "Best Next.js DX, fastest cold-starts. Outside Azure boundary.",
    },
  ],
  storage: [
    {
      id: "store-default",
      label: "Azure Blob Storage",
      sub: "SAS URLs · Cool 30d",
      costMul: 1,
      note: "Default. Lifecycle to Cool tier after 30 days.",
    },
    {
      id: "store-r2",
      label: "Cloudflare R2",
      sub: "$0 egress",
      costMul: 0.7,
      note: "$0 egress kills CDN bills at scale. Cross-cloud auth.",
    },
    {
      id: "store-s3",
      label: "AWS S3",
      sub: "Standard-IA",
      costMul: 1.05,
      note: "Familiar tooling. Cross-cloud egress applies.",
    },
  ],
  lb: [
    {
      id: "lb-default",
      label: "Front Door + WAF",
      sub: "Standard · CDN",
      costMul: 1,
      note: "Default. Global anycast + managed WAF + CDN in one hop.",
    },
    {
      id: "lb-cf",
      label: "Cloudflare",
      sub: "WAF + CDN + bot mgmt",
      costMul: 0.5,
      note: "Cheaper, stronger bot management. Adds a vendor outside Azure.",
    },
    {
      id: "lb-appgw",
      label: "Application Gateway",
      sub: "regional · WAF v2",
      costMul: 1.4,
      note: "Regional only — no global anycast. Tighter VNet integration.",
    },
  ],
};

type OrgConstraint = {
  id: string;
  label: string;
  hint: string;
  /** When enabled, override these node ids with the named option. */
  applies: { node: string; option: string }[];
  /** Multiply the entire BOM by this factor (e.g. multi-AZ ≈ 1.6×). */
  globalCostMul?: number;
};
const ORG_CONSTRAINTS: OrgConstraint[] = [
  {
    id: "no-redis",
    label: "We don't run Redis",
    hint: "Drops Redis. SSE replay falls back to Postgres LISTEN/NOTIFY.",
    applies: [{ node: "redis", option: "redis-pg" }],
  },
  {
    id: "no-managed-llm",
    label: "No managed LLMs",
    hint: "Replaces Azure OpenAI with self-hosted vLLM on AKS.",
    applies: [{ node: "vertex", option: "llm-vllm" }],
  },
  {
    id: "no-managed-pg",
    label: "No managed Postgres",
    hint: "Self-hosted Postgres on AKS. Cheaper, ops-heavy.",
    applies: [{ node: "db", option: "db-self" }],
  },
  {
    id: "multi-region",
    label: "Multi-region · active-active",
    hint: "Replicates web + DB tier across regions. ~1.7× total spend.",
    applies: [],
    globalCostMul: 1.7,
  },
  {
    id: "multi-az",
    label: "Multi-AZ within region",
    hint: "Standard-tier replicas across AZs. ~1.25× total spend.",
    applies: [],
    globalCostMul: 1.25,
  },
  {
    id: "no-egress",
    label: "Zero-egress storage",
    hint: "Forces Cloudflare R2 for object storage to kill CDN bills.",
    applies: [{ node: "storage", option: "store-r2" }],
  },
  {
    id: "cross-cloud-aws",
    label: "Cross-cloud: AWS data plane",
    hint: "Swaps DB → RDS, queue → SQS, storage → S3.",
    applies: [
      { node: "db", option: "db-rds" },
      { node: "queue", option: "q-sqs" },
      { node: "storage", option: "store-s3" },
    ],
  },
];

/** Directed edges between nodes. Each carries a label that names the protocol
 *  / payload — what makes the diagram look like real architecture. */
type EdgeKind = "sync" | "async" | "data" | "external";
type ArchEdge = {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
  /** which side of `from` the edge leaves (auto-routes if omitted) */
  curve?: number; // 0 = straight, +/- pulls the midpoint
  appearsAt: Phase;
  /** Throughput at brief baseline e.g. "~12 RPS" */
  qps?: string;
  /** p95 latency at this hop e.g. "40 ms" */
  p95?: string;
  /** Retry/backoff policy e.g. "5× exp backoff · DLQ" */
  retry?: string;
  /** Payload shape/size e.g. "JSON 2 KB" */
  payload?: string;
};

const EDGES: ArchEdge[] = [
  {
    from: "user",
    to: "lb",
    label: "HTTPS",
    kind: "sync",
    appearsAt: "architect",
    qps: "~12 RPS",
    p95: "8 ms",
    payload: "JSON ≤ 4 KB",
  },
  {
    from: "lb",
    to: "web",
    label: "",
    kind: "sync",
    appearsAt: "architect",
    qps: "~12 RPS",
    p95: "4 ms",
    payload: "forwarded",
  },
  {
    from: "web",
    to: "queue",
    label: "publish run",
    kind: "async",
    appearsAt: "architect",
    qps: "~30 / hr",
    p95: "60 ms",
    retry: "3× · backoff",
    payload: "RunSpec 2 KB",
  },
  {
    from: "queue",
    to: "worker",
    label: "managed-identity pull",
    kind: "async",
    appearsAt: "architect",
    qps: "~30 / hr",
    p95: "120 ms",
    retry: "5× exp · DLQ",
    payload: "RunSpec + token",
  },
  {
    from: "worker",
    to: "redis",
    label: "SSE events",
    kind: "data",
    appearsAt: "architect",
    qps: "~40 events / run",
    p95: "2 ms",
    payload: "event ≤ 1 KB",
  },
  {
    from: "web",
    to: "redis",
    label: "subscribe",
    kind: "data",
    curve: 30,
    appearsAt: "architect",
    qps: "1 / viewer",
    p95: "1 ms",
    payload: "stream cursor",
  },
  {
    from: "worker",
    to: "db",
    label: "persist",
    kind: "data",
    appearsAt: "cost",
    qps: "~80 / run",
    p95: "6 ms",
    retry: "2×",
    payload: "row ≤ 8 KB",
  },
  {
    from: "worker",
    to: "storage",
    label: "artifacts",
    kind: "data",
    appearsAt: "cost",
    qps: "3 PUT / run",
    p95: "180 ms",
    payload: "PDF + MD ~ 800 KB",
  },
  {
    from: "worker",
    to: "vertex",
    label: "LLM",
    kind: "external",
    appearsAt: "research_workers",
    qps: "15–40 / run",
    p95: "4.2 s",
    retry: "router fallover",
    payload: "prompt + tools",
  },
  {
    from: "web",
    to: "stripe",
    label: "checkout",
    kind: "external",
    appearsAt: "packager",
    qps: "1 / run",
    p95: "320 ms",
    payload: "session",
  },
];

/** Decisions stream into the right column as phases complete. */
type Decision = {
  id: string;
  topic: string;
  pick: string;
  vs: string;
  why: string;
  conf: "low" | "med" | "high";
  cite: number;
  revealsAt: Phase;
  /** 1-way door (hard to reverse) vs 2-way door (easy). */
  reversibility?: "1-way" | "2-way";
  /** What breaks if this is wrong. */
  blastRadius?: "service" | "data" | "platform";
  /** Concrete trigger that should make us re-open this decision. */
  revisitAt?: string;
};

const DECISIONS: Decision[] = [
  {
    id: "d-db",
    topic: "Primary database",
    pick: "Azure DB for Postgres 16 (Flexible) + pgvector",
    vs: "vs Cosmos DB for Postgres · Cosmos DB · Azure SQL",
    why: "Single DB for relational + vectors at MVP scale. Cosmos for Postgres only wins above 5 TB.",
    conf: "high",
    cite: 7,
    revealsAt: "synthesizer",
    reversibility: "2-way",
    blastRadius: "data",
    revisitAt: "DB > 5 TB or sustained > 5k QPS",
  },
  {
    id: "d-queue",
    topic: "Job queue",
    pick: "Service Bus + KEDA-driven worker",
    vs: "vs Storage Queues · Event Grid · Redis Streams",
    why: "Managed-identity auth + native DLQ + sessions. KEDA scales the worker to zero between runs.",
    conf: "high",
    cite: 5,
    revealsAt: "synthesizer",
    reversibility: "2-way",
    blastRadius: "service",
    revisitAt: "Need ordered delivery or > 100k msg/s",
  },
  {
    id: "d-llm",
    topic: "LLM router",
    pick: "Azure OpenAI → Anthropic on Foundry → OpenAI direct",
    vs: "vs single-provider",
    why: "GPT-4o-mini for tier-B, GPT-5 for synthesis. Claude failover stays inside Azure data boundary.",
    conf: "med",
    cite: 4,
    revealsAt: "architect",
    reversibility: "2-way",
    blastRadius: "service",
    revisitAt: "Quality regression in eval suite > 5%",
  },
  {
    id: "d-cost",
    topic: "Cost at launch",
    pick: "$192 / mo idle · $1,940 at 10×",
    vs: "vs $640 idle on Cosmos for Postgres",
    why: "B1ms Burstable tier covers MVP traffic. Migrate to D2s v5 at >150 RPS.",
    conf: "high",
    cite: 8,
    revealsAt: "cost",
    reversibility: "2-way",
    blastRadius: "platform",
    revisitAt: "Sustained CPU > 70% on db tier",
  },
  {
    id: "d-risk",
    topic: "Risk to flag",
    pick: "Cold-start on min-0 worker",
    vs: "",
    why: "First run after idle adds ~6s. Acceptable for 12-min jobs; revisit if SLO < 1 min.",
    conf: "med",
    cite: 6,
    revealsAt: "risk",
    reversibility: "2-way",
    blastRadius: "service",
    revisitAt: "SLO commitment changes to < 60 s end-to-end",
  },
];

const SOURCES: ReadonlyArray<{ n: number; kind: "KB" | "Web"; text: string }> = [
  { n: 1, kind: "KB", text: "Azure Container Apps · scale-to-zero baseline (KB · 14d)" },
  { n: 2, kind: "Web", text: "Azure Front Door + WAF docs · 2026-04-19" },
  { n: 3, kind: "KB", text: "Next.js 15 on Container Apps · production guide (KB · 7d)" },
  { n: 4, kind: "Web", text: "Azure OpenAI quotas + PTU pricing · 2026-05-02" },
  { n: 5, kind: "KB", text: "Service Bus + managed-identity auth (KB · 21d)" },
  { n: 6, kind: "KB", text: "Azure Cache for Redis Basic SLA (KB · 30d)" },
  { n: 7, kind: "Web", text: "pgvector benchmarks @ 50M rows · 2026-04-12" },
  { n: 8, kind: "KB", text: "Azure DB for Postgres Flexible pricing · westeurope (KB · 9d)" },
];

/** Bill of materials. Each line scales linearly with three knobs the user
 *  can drag in the Cost lens: users (×), RPS (×), GB stored (×). All values
 *  are USD/month at 1×; multipliers are added on top.                      */
type BomLine = {
  id: string;
  service: string;
  sku: string;
  base: number; // monthly $ at 1×
  per: { users: number; rps: number; gb: number };
  cite: number;
  nodeId?: string; // links into the architecture diagram
  why: string;
  alts?: string;
  /** 0..100 — how much of the cheap line is covered by the Azure free tier / dev credit. */
  freeTierPct?: number;
  /** Step-cost cliff users hit at scale. */
  cliff?: { atScale: string; jumpsTo: number; reason: string };
  /** Cost category for the variable / fixed donut. */
  kind?: "compute" | "data" | "network" | "vendor" | "observability";
  fixed?: boolean;
};

const BOM_LINES: BomLine[] = [
  {
    id: "b-lb",
    service: "Front Door + WAF",
    sku: "Standard SKU · managed WAF",
    base: 35,
    per: { users: 0.4, rps: 6, gb: 0 },
    cite: 2,
    nodeId: "lb",
    why: "Anycast L7 + WAF + CDN in one hop. Egress dominates above 100 GB/mo.",
    alts: "Cloudflare · CloudFront",
    freeTierPct: 0,
    kind: "network",
    fixed: true,
    cliff: {
      atScale: "> 200 RPS",
      jumpsTo: 330,
      reason: "Premium SKU + bot-manager rules; egress crosses zone-2 threshold",
    },
  },
  {
    id: "b-web",
    service: "tessar-web (Container Apps)",
    sku: "0.5 vCPU · 1 GiB · min 1",
    base: 28,
    per: { users: 0.6, rps: 3.2, gb: 0 },
    cite: 3,
    nodeId: "web",
    why: "min 1 keeps cold-start out of UX path. KEDA scales on concurrency.",
    alts: "AKS · App Service",
    freeTierPct: 30,
    kind: "compute",
  },
  {
    id: "b-worker",
    service: "tessar-orchestrator",
    sku: "2 vCPU · 4 GiB · min 0",
    base: 14,
    per: { users: 1.8, rps: 0.4, gb: 0 },
    cite: 3,
    nodeId: "worker",
    why: "min 0 saves ~$140/mo idle. Service Bus buffers cold-start latency.",
    alts: "Azure Functions Premium · AKS Job",
    freeTierPct: 20,
    kind: "compute",
  },
  {
    id: "b-queue",
    service: "Service Bus",
    sku: "Standard · runs queue + DLQ",
    base: 10,
    per: { users: 0.18, rps: 0.6, gb: 0 },
    cite: 5,
    nodeId: "queue",
    why: "$10/mo base + $0.05 per million ops. Premium needed only for VNet injection.",
    alts: "Storage Queues · Event Grid",
    freeTierPct: 0,
    kind: "network",
  },
  {
    id: "b-redis",
    service: "Azure Cache for Redis",
    sku: "Basic C0 · 250 MB · single AZ",
    base: 17,
    per: { users: 0, rps: 0.2, gb: 4 },
    cite: 6,
    nodeId: "redis",
    why: "Streams power SSE replay + prompt cache. Step-jumps to $290 at Standard C2.",
    alts: "Upstash · Postgres LISTEN/NOTIFY",
    kind: "data",
    fixed: true,
    cliff: {
      atScale: "need HA / zone-redundant",
      jumpsTo: 290,
      reason: "Standard C2 6 GB is 17× the Basic C0 price",
    },
  },
  {
    id: "b-db",
    service: "Azure DB for Postgres",
    sku: "B1ms · 1 vCPU · 2 GiB · HA off",
    base: 14,
    per: { users: 1.2, rps: 1.4, gb: 0.115 },
    cite: 8,
    nodeId: "db",
    why: "Cosmos for Postgres only wins above ~5 TB / 5k QPS. Read replica at 10× costs +$60/mo.",
    alts: "Cosmos for Postgres · Cosmos DB · Azure SQL",
    kind: "data",
    cliff: {
      atScale: "~12k users",
      jumpsTo: 145,
      reason: "Burstable saturates; jump to D2s v5 General Purpose + replica",
    },
  },
  {
    id: "b-storage",
    service: "Azure Blob Storage",
    sku: "Hot → Cool 30d · LRS",
    base: 2,
    per: { users: 0, rps: 0, gb: 0.018 },
    cite: 8,
    nodeId: "storage",
    why: "Lifecycle to Cool saves 50% after 30 d. SAS URLs avoid proxy egress.",
    alts: "S3 · R2",
    freeTierPct: 70,
    kind: "data",
  },
  {
    id: "b-vertex",
    service: "Azure OpenAI",
    sku: "GPT-4o-mini + GPT-5 mix",
    base: 0,
    per: { users: 18, rps: 0, gb: 0 },
    cite: 4,
    nodeId: "vertex",
    why: "$0.30 avg/run. Caching trims ~35% at 10×. PTU reserved capacity at 100×.",
    alts: "Anthropic on Foundry · OpenAI direct",
    kind: "vendor",
  },
  {
    id: "b-egress",
    service: "Bandwidth egress",
    sku: "Zone-1 · EU",
    base: 5,
    per: { users: 0.2, rps: 1.8, gb: 0.087 },
    cite: 2,
    why: "First 100 GB/mo free in zone-1. Crosses to $0.087/GB after.",
    kind: "network",
  },
  {
    id: "b-obs",
    service: "Observability",
    sku: "App Insights + Log Analytics + Sentry",
    base: 14,
    per: { users: 0.05, rps: 0.4, gb: 0 },
    cite: 1,
    why: "5 GB/mo logs free, then $2.30/GB. 3 trace samples/req. Sentry team plan covers FE+BE.",
    kind: "observability",
    fixed: true,
  },
  {
    id: "b-secrets",
    service: "Azure Key Vault",
    sku: "10 secrets · 100k access/mo",
    base: 1,
    per: { users: 0, rps: 0, gb: 0 },
    cite: 1,
    why: "Managed identity per service. $0.03/10k operations covers MVP.",
    freeTierPct: 80,
    kind: "observability",
    fixed: true,
  },
  {
    id: "b-stripe",
    service: "Stripe",
    sku: "Checkout + webhooks",
    base: 0,
    per: { users: 0.9, rps: 0, gb: 0 },
    cite: 8,
    nodeId: "stripe",
    why: "2.9% + 30¢ per run. Volume tier at $250k GMV/mo.",
    alts: "Lemon Squeezy · Paddle",
    kind: "vendor",
  },
];

/** Risks the architect should know about. Plotted on a 3×3 matrix
 *  (likelihood × impact) in the Risks lens.                              */
type Severity = "low" | "med" | "high";
type Risk = {
  id: string;
  title: string;
  area: string;
  likelihood: Severity;
  impact: Severity;
  detail: string;
  mitigation: string;
  cite?: number;
  nodeId?: string;
  /** Time-to-mitigate — budget the architect needs. */
  effort?: "hours" | "days" | "weeks";
  /** Who should own this. */
  owner?: "eng" | "sec" | "ops" | "vendor";
  /** This risk only matters if. */
  precondition?: string;
};

const RISKS: Risk[] = [
  {
    id: "r-cold",
    title: "Cold-start on min-0 worker",
    area: "Latency",
    likelihood: "high",
    impact: "low",
    detail: "First run after idle adds ~6 s container boot.",
    mitigation:
      "Acceptable for 12-min jobs. Revisit if SLO < 1 min — switch worker to min 1 (+$28/mo).",
    cite: 6,
    nodeId: "worker",
    effort: "hours",
    owner: "eng",
    precondition: "You commit to a tight end-to-end SLO",
  },
  {
    id: "r-llm",
    title: "LLM provider quota exhaustion",
    area: "Vendor",
    likelihood: "med",
    impact: "high",
    detail: "Azure OpenAI GPT-5 has per-region TPM/RPM caps that can throttle bursts.",
    mitigation:
      "Router fails over to Anthropic on Foundry, then OpenAI direct. Pre-purchase PTU at 100×.",
    cite: 4,
    nodeId: "vertex",
    effort: "days",
    owner: "eng",
    precondition: "Sustained > 200 runs / hour",
  },
  {
    id: "r-cost",
    title: "LLM cost per run drift",
    area: "Cost",
    likelihood: "med",
    impact: "med",
    detail: "Token spend rises if prompts grow or caching misses.",
    mitigation:
      "Hard per-run budget; abort + refund + alert. Weekly cost-per-run dashboard review.",
    cite: 4,
    nodeId: "vertex",
    effort: "days",
    owner: "eng",
    precondition: "Always — watched continuously",
  },
  {
    id: "r-redis",
    title: "Redis single-AZ data loss",
    area: "Availability",
    likelihood: "low",
    impact: "med",
    detail: "Basic C0 cache is single-zone — failure = SSE replay buffer lost.",
    mitigation:
      "Events also persisted to Postgres run_events. Move to Standard C2 (+$273/mo) before SLA promise.",
    cite: 6,
    nodeId: "redis",
    effort: "hours",
    owner: "ops",
    precondition: "Before publishing an availability SLA",
  },
  {
    id: "r-db",
    title: "DB migration off Flexible Server",
    area: "Lock-in",
    likelihood: "low",
    impact: "high",
    detail: "Above ~5 TB or 5k QPS, Flexible Server hits IOPS ceiling on Burstable family.",
    mitigation:
      "Schema is portable Postgres. Cosmos for Postgres upgrade is in-place; Cosmos NoSQL needs rewrite.",
    cite: 7,
    nodeId: "db",
    effort: "weeks",
    owner: "eng",
    precondition: "You cross 5 TB or 5k QPS sustained",
  },
  {
    id: "r-prompt",
    title: "Prompt-injection via scraped content",
    area: "Security",
    likelihood: "high",
    impact: "med",
    detail: "Web sources can carry instructions that try to override system prompt.",
    mitigation:
      "Workers are instructed to ignore in-content instructions. Untrusted content rendered in markdown-only sandbox.",
    cite: 1,
    effort: "days",
    owner: "sec",
    precondition: "Always — attack class is permanent",
  },
  {
    id: "r-region",
    title: "Single-region outage",
    area: "Availability",
    likelihood: "low",
    impact: "high",
    detail: "EU residency = single region at MVP. Region-wide outage takes the product down.",
    mitigation:
      "Status page + RTO 60 min commitment. Multi-region in Phase 6+ — Postgres geo-replica adds ~$140/mo.",
    cite: 2,
    effort: "weeks",
    owner: "ops",
    precondition: "After first paying enterprise customer",
  },
];

/** Selection drives the right-rail Inspector. */
type Selection =
  | { kind: "node"; id: string }
  | { kind: "decision"; id: string }
  | { kind: "bom"; id: string }
  | { kind: "risk"; id: string }
  | { kind: "source"; n: number }
  | { kind: "assumption"; id: string }
  | { kind: "roadmap"; id: string }
  | null;

type Lens =
  | "architecture"
  | "cost"
  | "risks"
  | "decisions"
  | "sequence"
  | "package"
  | "assumptions"
  | "roadmap";

/** Assumptions the run made. Editable in principle (regenerate would re-run);
 *  surfaced so the architect can decide if the package matches their world. */
type Assumption = {
  id: string;
  category: "scale" | "compliance" | "team" | "slo" | "domain";
  text: string;
  impact: string;
  editable: boolean;
};

const ASSUMPTIONS: Assumption[] = [
  {
    id: "a-region",
    category: "compliance",
    text: "EU data residency required (westeurope only)",
    impact: "Forces single-region at MVP. Multi-region adds ~$370/mo at 10×.",
    editable: true,
  },
  {
    id: "a-scale",
    category: "scale",
    text: "1k MAU at launch, growing 2× / quarter",
    impact: "DB stays on shared-core for ~9 months. Worker can stay min 0.",
    editable: true,
  },
  {
    id: "a-tenants",
    category: "scale",
    text: "Multi-tenant, hundreds of tenants, no per-tenant DB",
    impact: "Schema-level isolation only. Single-tenant tier would 5× DB cost.",
    editable: true,
  },
  {
    id: "a-slo",
    category: "slo",
    text: "End-to-end run target: 8–15 min · no hard SLA at MVP",
    impact: "Cold-start risk is acceptable. min-1 worker not needed.",
    editable: true,
  },
  {
    id: "a-team",
    category: "team",
    text: "1 full-stack engineer + 0.5 ops, no 24×7 on-call",
    impact:
      "Drives managed-only choices (Container Apps, Flexible Server, Cache for Redis). No AKS, no self-hosted.",
    editable: true,
  },
  {
    id: "a-data",
    category: "compliance",
    text: "Customer briefs may contain commercially sensitive text",
    impact: "Forces encrypted-at-rest object store + audit log on all reads.",
    editable: false,
  },
  {
    id: "a-pii",
    category: "compliance",
    text: "No PII in run inputs (briefs are abstract system specs)",
    impact: "Removes need for PII tokenisation pipeline. Revisit if intake widens.",
    editable: true,
  },
  {
    id: "a-domain",
    category: "domain",
    text: "Domain scope: SaaS web apps (B2B/B2C). Not embedded / IoT.",
    impact: "KB seeded for SaaS patterns only. Out-of-domain runs will hit low-confidence flags.",
    editable: false,
  },
];

/** Roadmap turns the design package into a build order with effort estimates. */
type RoadmapItem = {
  id: string;
  phase: "Day 1" | "Week 1" | "Month 1" | "Quarter 1";
  title: string;
  effort: string;
  owner: "eng" | "sec" | "ops" | "design" | "product";
  unblocks?: string[];
  decisionId?: string;
};

const ROADMAP: RoadmapItem[] = [
  // Day 1 \u2014 nothing exists, get the spine up
  {
    id: "rm-repo",
    phase: "Day 1",
    title: "Monorepo + CI on GitHub Actions",
    effort: "2 h",
    owner: "eng",
  },
  {
    id: "rm-tf",
    phase: "Day 1",
    title: "Terraform: subscription, VNet, Container Registry",
    effort: "4 h",
    owner: "eng",
  },
  {
    id: "rm-runweb",
    phase: "Day 1",
    title: "Container Apps \u00b7 tessar-web (hello world)",
    effort: "2 h",
    owner: "eng",
    unblocks: ["rm-runworker"],
  },
  {
    id: "rm-sql",
    phase: "Day 1",
    title: "Azure DB Flexible + pgvector + private endpoint",
    effort: "3 h",
    owner: "eng",
    decisionId: "d-db",
  },
  // Week 1 \u2014 vertical slice
  {
    id: "rm-runworker",
    phase: "Week 1",
    title: "Container Apps \u00b7 tessar-orchestrator skeleton",
    effort: "1 d",
    owner: "eng",
  },
  {
    id: "rm-pubsub",
    phase: "Week 1",
    title: "Service Bus queue + DLQ + managed identity",
    effort: "1 d",
    owner: "eng",
    decisionId: "d-queue",
  },
  {
    id: "rm-redis",
    phase: "Week 1",
    title: "Cache for Redis Basic C0 + SSE replay buffer",
    effort: "1 d",
    owner: "eng",
  },
  {
    id: "rm-auth",
    phase: "Week 1",
    title: "Auth.js + Resend magic link",
    effort: "1 d",
    owner: "eng",
  },
  {
    id: "rm-llm",
    phase: "Week 1",
    title: "Azure OpenAI router + Anthropic failover",
    effort: "2 d",
    owner: "eng",
    decisionId: "d-llm",
  },
  // Month 1 \u2014 production hardening
  {
    id: "rm-armor",
    phase: "Month 1",
    title: "Front Door WAF policy + bot-manager rules",
    effort: "1 d",
    owner: "sec",
  },
  {
    id: "rm-stripe",
    phase: "Month 1",
    title: "Stripe Checkout + webhook signature + idempotency",
    effort: "2 d",
    owner: "eng",
  },
  {
    id: "rm-otel",
    phase: "Month 1",
    title: "OpenTelemetry \u2192 App Insights + Sentry",
    effort: "2 d",
    owner: "eng",
  },
  {
    id: "rm-eval",
    phase: "Month 1",
    title: "Eval harness + CI gate for prompt changes",
    effort: "3 d",
    owner: "eng",
  },
  {
    id: "rm-runbook",
    phase: "Month 1",
    title: "Runbooks + status page + restore drill",
    effort: "2 d",
    owner: "ops",
  },
  // Quarter 1 — trust + scale
  {
    id: "rm-soc",
    phase: "Quarter 1",
    title: "SOC 2 Type 1 readiness (controls + evidence)",
    effort: "4 w",
    owner: "ops",
  },
  {
    id: "rm-multireg",
    phase: "Quarter 1",
    title: "Multi-region read replica (after first ent. customer)",
    effort: "1 w",
    owner: "eng",
    decisionId: "d-cost",
  },
  {
    id: "rm-billing",
    phase: "Quarter 1",
    title: "Stripe Billing migration if usage-tier launches",
    effort: "2 w",
    owner: "eng",
  },
];

/** Latency budget per hop — used in Sequence lens to add a budget bar. */
const LATENCY_HOPS: Array<{ node: string; ms: number; note: string }> = [
  { node: "lb", ms: 8, note: "TLS terminate + WAF check" },
  { node: "web", ms: 40, note: "Auth + validation + Service Bus publish" },
  { node: "queue", ms: 120, note: "Lock acquire + managed-identity verify" },
  { node: "worker", ms: 8400, note: "9 agents, 15–40 LLM calls" },
  { node: "vertex", ms: 4200, note: "GPT-5 + GPT-4o-mini mix (parallel)" },
  { node: "db", ms: 60, note: "~80 writes, all single-row" },
  { node: "storage", ms: 180, note: "PDF upload (≈800 KB)" },
];

/** Error path — second swimlane in Sequence lens. */
const ERROR_PATH: Array<{
  from: string;
  to: string;
  label: string;
  kind: "sync" | "async" | "external";
}> = [
  { from: "worker", to: "vertex", label: "GPT-5 call (frontier)", kind: "external" },
  { from: "vertex", to: "worker", label: "429 quota exceeded", kind: "external" },
  { from: "worker", to: "vertex", label: "retry: Anthropic on Foundry", kind: "external" },
  { from: "vertex", to: "worker", label: "OK — same Azure boundary", kind: "external" },
  { from: "worker", to: "user", label: "run continues, no user impact", kind: "async" },
];

/** Package lens: gaps the deliverable does NOT cover. Sets honest expectations. */
const PACKAGE_GAPS: Array<{ title: string; detail: string; planned?: string }> = [
  {
    title: "Load-test plan",
    detail: "No k6 / Locust scripts. You will need one before publishing an SLA.",
    planned: "Phase 6+ — priced separately",
  },
  {
    title: "Terraform / IaC files",
    detail: "We list the Azure services. We don&apos;t (yet) generate Terraform / Bicep modules.",
    planned: "Backlog — high signal but slow to maintain",
  },
  {
    title: "Runbooks",
    detail: "Architecture only. On-call playbooks (oncall, escalation, restore) are out of scope.",
    planned: "Phase 6+",
  },
  {
    title: "Threat model",
    detail: "Top-line security risks only. No STRIDE walkthrough or attack tree.",
    planned: "Backlog",
  },
  {
    title: "Capacity model",
    detail: "Linear scale knobs only. No queueing-theory model for burst behavior.",
    planned: "Phase 6+",
  },
];

/** Audit metadata surfaced on the Package lens. Mock values today; in
 *  Phase 3 these come from the run record (model versions, KB snapshot id,
 *  prompt + token counters). The product-goals trust requirement makes
 *  these visible on every run, no exception. */
const AUDIT_META: Array<{ label: string; value: string }> = [
  { label: "Model · tier-A", value: "gemini-1.5-pro-002" },
  { label: "Model · tier-B", value: "gemini-1.5-flash-002" },
  { label: "KB snapshot", value: "kb-2026-05-08·rev-147" },
  { label: "Prompts versioned", value: "v0.4.2 · 9 nodes" },
  { label: "Tokens · this run", value: "412,938" },
];

const SAMPLE_BRIEF = `B2B SaaS that ingests ~10M product events/day, computes usage metrics, and bills customers monthly. Multi-tenant. EU residency. Budget under $400/mo at launch.`;

/* ─── Studio data context ─────────────────────────────────────────
 * The studio body and its helpers were originally hard-wired to the
 * canned demo constants above. To reuse this same component for a
 * real RunPackage at /decide/[id], we expose the data via context
 * and inject it as a prop. The /decide route keeps the full demo
 * shape (sample switcher + canned fixtures); /decide/[id] supplies
 * data mapped from the persisted RunPackage. Helpers that previously
 * closed over module-level constants now read them via useDecideData(),
 * preserving the original visual structure.
 * ----------------------------------------------------------------- */

export type DecideData = {
  nodes: ArchNode[];
  edges: ArchEdge[];
  decisions: Decision[];
  bom: BomLine[];
  risks: Risk[];
  assumptions: Assumption[];
  roadmap: RoadmapItem[];
  sources: ReadonlyArray<{ n: number; kind: "KB" | "Web"; text: string }>;
  componentOptions: Record<string, ComponentOption[]>;
  orgConstraints: OrgConstraint[];
  latencyHops: ReadonlyArray<{ node: string; ms: number; note: string }>;
  errorPath: ReadonlyArray<{
    from: string;
    to: string;
    label: string;
    kind: "sync" | "async" | "external";
  }>;
  packageGaps: ReadonlyArray<{ title: string; detail: string; planned?: string }>;
  auditMeta: ReadonlyArray<{ label: string; value: string }>;
  brief: string;
};

export type DecideRunMeta = {
  /** When set, the download CTA links to real artifacts. */
  runId?: string;
  /** Direct href for the Markdown artifact (overrides runId-derived URL). */
  mdHref?: string;
  /** Direct href for the PDF artifact (overrides runId-derived URL). */
  pdfHref?: string;
  /** Show the canned-sample switcher in the top bar (demo path only). */
  sampleSwitcher?: boolean;
  /** Optional badge text — e.g. "Sample run" vs "Run #abc123". */
  runLabel?: string;
};

const DecideDataContext = createContext<DecideData | null>(null);
const DecideRunContext = createContext<DecideRunMeta>({});

function useDecideData(): DecideData {
  const ctx = useContext(DecideDataContext);
  if (!ctx) {
    throw new Error("useDecideData() must be used inside <DecideStudio>");
  }
  return ctx;
}

function useDecideRun(): DecideRunMeta {
  return useContext(DecideRunContext);
}

function DecideStudioBody(): React.ReactElement {
  // Inject data + run metadata via context. Aliased destructuring keeps the
  // body's existing references to NODES, EDGES, … intact so the original
  // /decide prototype layout is preserved verbatim while the source of
  // truth shifts from canned constants to the supplied DecideData.
  const data = useDecideData();
  const meta = useDecideRun();
  const {
    nodes: NODES,
    edges: EDGES,
    decisions: DECISIONS,
    bom: BOM_LINES,
    risks: RISKS,
    assumptions: ASSUMPTIONS,
    roadmap: ROADMAP,
    sources: SOURCES,
    componentOptions: COMPONENT_OPTIONS,
    orgConstraints: ORG_CONSTRAINTS,
  } = data;

  // Sample switcher — Phase-1 only swaps header context (title + persona +
  // scale assumption). Diagram fixtures stay shared across samples; deeper
  // per-sample data lands in Phase 3 with real RunPackage payloads. Only
  // active on the canned /decide demo route (meta.sampleSwitcher === true).
  const [sampleId, setSampleId] = useState<SampleId>("saas");
  const [brief, setBrief] = useState(data.brief);
  useEffect(() => {
    if (!meta.sampleSwitcher) return;
    if (typeof window === "undefined") return;
    const u = new URLSearchParams(window.location.search).get("sample");
    if (u && SAMPLE_PACKAGES.some((s) => s.id === u)) {
      const next = getSample(u);
      setSampleId(next.id);
      setBrief(`${next.briefTitle}. ${next.briefOneLiner}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.sampleSwitcher]);
  const switchSample = (id: SampleId): void => {
    setSampleId(id);
    const next = getSample(id);
    // Re-seed the brief textarea with the sample's title + one-liner so
    // the brief-panel reflects the active sample. User edits are still
    // accepted afterward via the textarea.
    setBrief(`${next.briefTitle}. ${next.briefOneLiner}`);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("sample", id);
      window.history.replaceState({}, "", u.toString());
    }
  };

  // The phased reveal is recorded on the previous /run/[id] screen, so /decide
  // lands directly in the final "done" state. The phaseIndex / running fields
  // are kept so the existing visibility gates and timeline UI keep working
  // without a deeper refactor; they're just frozen at the terminal value.
  const [phaseIndex] = useState(PHASES.length - 1);
  const running = false;
  const [done] = useState(true);
  const [elapsedMs] = useState(0);

  // The new interaction model ──────────────────────────────────────
  const [lens, setLens] = useState<Lens>("architecture");
  const [selection, setSelection] = useState<Selection>(null);
  const [briefOpen, setBriefOpen] = useState(true);

  // Cost-lens scale knobs (multipliers from the brief baseline)
  const [users, setUsers] = useState(1);
  const [rps, setRps] = useState(1);
  const [gb, setGb] = useState(1);

  // ── User tweaks ────────────────────────────────────────────────
  // overrides: nodeId → optionId (from COMPONENT_OPTIONS).
  // constraints: set of ORG_CONSTRAINTS ids currently enabled.
  // Both compose: org constraints fan out to overrides, individual overrides
  // win when the user picks an explicit option after toggling a constraint.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [constraints, setConstraints] = useState<Set<string>>(() => new Set());
  const setOverride = (nodeId: string, optionId: string | null): void => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (optionId === null) delete next[nodeId];
      else next[nodeId] = optionId;
      return next;
    });
  };
  const toggleConstraint = (id: string): void => {
    setConstraints((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const resetTweaks = (): void => {
    setOverrides({});
    setConstraints(new Set());
  };

  // Compose constraints → overrides, then user overrides win.
  const effectiveOverrides = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const c of ORG_CONSTRAINTS) {
      if (!constraints.has(c.id)) continue;
      for (const a of c.applies) out[a.node] = a.option;
    }
    return { ...out, ...overrides };
  }, [overrides, constraints]);

  const globalCostMul = useMemo<number>(() => {
    let m = 1;
    for (const c of ORG_CONSTRAINTS) {
      if (constraints.has(c.id) && c.globalCostMul) m *= c.globalCostMul;
    }
    return m;
  }, [constraints]);

  /** Resolve the (possibly overridden) option for a node. Returns null if no
   *  options are defined for this node. */
  const optionFor = (nodeId: string): ComponentOption | null => {
    const opts = COMPONENT_OPTIONS[nodeId];
    if (!opts) return null;
    const id = effectiveOverrides[nodeId] ?? opts[0]!.id;
    return opts.find((o) => o.id === id) ?? opts[0] ?? null;
  };

  // Apply overrides to the canonical NODES list. Removed nodes drop out.
  const effectiveNodes = useMemo<ArchNode[]>(() => {
    return NODES.flatMap((n) => {
      const opt = optionFor(n.id);
      if (!opt) return [n];
      if (opt.remove) return [];
      if (opt.id === COMPONENT_OPTIONS[n.id]?.[0]?.id) return [n];
      return [{ ...n, label: opt.label, sub: opt.sub }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOverrides]);

  // Edges that touch a removed node disappear too.
  const effectiveEdges = useMemo<ArchEdge[]>(() => {
    const liveIds = new Set(effectiveNodes.map((n) => n.id));
    return EDGES.filter((e) => liveIds.has(e.from) && liveIds.has(e.to));
  }, [effectiveNodes]);

  // Guidance — overall view mode + numbered path strip + dismissable
  // first-run tooltip per lens. Tour state is in-memory only (mock).
  const [mode, setMode] = useState<"lens" | "story">("lens");
  const [showTour, setShowTour] = useState<Record<Lens, boolean>>({
    architecture: true,
    cost: true,
    risks: true,
    decisions: true,
    sequence: true,
    package: true,
    assumptions: true,
    roadmap: true,
  });
  const dismissTour = (l: Lens): void => setShowTour((s) => ({ ...s, [l]: false }));

  const currentPhase = phaseIndex >= 0 ? PHASES[phaseIndex]?.id : null;

  // Phase auto-advance and elapsed-time effects are intentionally removed:
  // /decide always renders the terminal state. See `phaseIndex` declaration.

  const reachedIdx = (p: Phase): number => PHASES.findIndex((x) => x.id === p);

  const visibleNodes = useMemo(
    () =>
      effectiveNodes.filter((n) => {
        if (done) return true;
        if (phaseIndex < 0) return false;
        return phaseIndex >= reachedIdx(n.appearsAt);
      }),
    [phaseIndex, done, effectiveNodes],
  );
  const visibleEdges = useMemo(
    () =>
      effectiveEdges.filter((e) => {
        if (done) return true;
        if (phaseIndex < 0) return false;
        return phaseIndex >= reachedIdx(e.appearsAt);
      }),
    [phaseIndex, done, effectiveEdges],
  );
  const visibleDecisions = useMemo(
    () =>
      DECISIONS.filter((d) => {
        if (done) return true;
        if (phaseIndex < 0) return false;
        return phaseIndex >= reachedIdx(d.revealsAt);
      }),
    [phaseIndex, done],
  );

  // Live BOM totals — recompute as the user drags scale knobs OR tweaks
  // components. A BOM line for a removed node disappears from the total.
  const bomTotals = useMemo(() => {
    const liveIds = new Set(effectiveNodes.map((n) => n.id));
    const lines = BOM_LINES.flatMap((l) => {
      if (l.nodeId && !liveIds.has(l.nodeId)) return [];
      const baseCost =
        l.base + l.per.users * (users - 1) + l.per.rps * (rps - 1) + l.per.gb * (gb - 1);
      const opt = l.nodeId ? optionFor(l.nodeId) : null;
      const mul = (opt?.costMul ?? 1) * globalCostMul;
      const cost = Math.max(0, baseCost * mul);
      // If the option swapped the service, rename the BOM line for clarity.
      const line: BomLine =
        opt && opt.id !== COMPONENT_OPTIONS[l.nodeId!]?.[0]?.id
          ? { ...l, service: opt.label, sku: opt.sub }
          : l;
      return [{ line, cost }];
    });
    const total = lines.reduce((sum, x) => sum + x.cost, 0);
    return { lines, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, rps, gb, effectiveNodes, effectiveOverrides, globalCostMul]);

  const handleRun = (): void => {
    // No-op: /decide always shows the terminal package. The run is performed
    // (and watched) on the previous /run/[id] screen.
  };
  const handleReset = (): void => {
    setSelection(null);
  };

  const status = done ? "Complete" : running ? (PHASES[phaseIndex]?.label ?? "Starting") : "Idle";

  // Synthesize a "selected" detail object for the Inspector ──────────
  const selectedNode =
    selection?.kind === "node" ? (effectiveNodes.find((n) => n.id === selection.id) ?? null) : null;
  const selectedDecision =
    selection?.kind === "decision" ? (DECISIONS.find((d) => d.id === selection.id) ?? null) : null;
  const selectedBom =
    selection?.kind === "bom"
      ? (bomTotals.lines.find((l) => l.line.id === selection.id) ?? null)
      : null;
  const selectedRisk =
    selection?.kind === "risk" ? (RISKS.find((r) => r.id === selection.id) ?? null) : null;

  const LENSES: Array<{ id: Lens; label: string; sub: string }> = [
    { id: "architecture", label: "Architecture", sub: "components + flow" },
    { id: "cost", label: "Cost", sub: `$${bomTotals.total.toFixed(0)} / mo` },
    { id: "risks", label: "Risks", sub: `${RISKS.length} flagged` },
    { id: "decisions", label: "Decisions", sub: `${visibleDecisions.length}/${DECISIONS.length}` },
    { id: "sequence", label: "Sequence", sub: "request walkthrough" },
    { id: "package", label: "Package", sub: "PDF preview" },
    { id: "assumptions", label: "Assumptions", sub: `${ASSUMPTIONS.length} — editable` },
    { id: "roadmap", label: "Roadmap", sub: `${ROADMAP.length} steps · 4 phases` },
  ];

  return (
    <div className="bg-surface text-on-surface relative h-dvh w-screen overflow-hidden">
      <MobileGate />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, rgb(var(--md-sys-color-primary) / 0.06), transparent 70%)",
        }}
      />

      {/* TOP STRIP — brand · lens tabs · status · theme/download.
          One thin row, hairline-bordered, no chrome card. */}
      <header className="border-outline-variant bg-surface/70 relative z-20 flex items-center gap-4 border-b px-5 py-2.5 backdrop-blur">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className="bg-primary text-on-primary grid size-6 place-items-center rounded-full shadow-[0_4px_14px_-6px_rgb(var(--md-sys-color-primary)/0.5)]"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M2 5.7L4.3 8L9 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[13px] font-semibold tracking-tight">TESSAR</span>
        </Link>

        {/* Sample switcher — only on the canned /decide demo route. For real
            runs (/decide/[id]) we surface the run label instead. */}
        {meta.sampleSwitcher ? (
          <div
            role="tablist"
            aria-label="Sample package"
            className="border-outline-variant bg-surface hidden items-center gap-0.5 rounded-full border p-0.5 md:flex"
          >
            {SAMPLE_PACKAGES.map((s) => {
              const active = s.id === sampleId;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={s.persona}
                  onClick={() => switchSample(s.id)}
                  className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-colors ${
                    active
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : meta.runLabel ? (
          <span className="border-outline-variant text-on-surface-variant hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold md:flex">
            <span aria-hidden className="bg-primary size-1.5 rounded-full" />
            {meta.runLabel}
          </span>
        ) : null}

        <span aria-hidden className="bg-outline-variant h-5 w-px" />

        {/* Lens tabs — primary navigation across the design package.
            Numbered chip on the left of each tab is the path indicator
            (replaces the old separate path strip). Hover for guidance. */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {LENSES.map((l, i) => {
            const active = lens === l.id;
            const idx = LENSES.findIndex((x) => x.id === lens);
            const visited = i <= idx;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLens(l.id)}
                title={LENS_PROMPT[l.id]}
                className={`group relative flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface"
                }`}
              >
                <span
                  aria-hidden
                  className={`relative grid size-4 place-items-center rounded-full text-[9.5px] font-semibold tabular-nums transition-colors ${
                    active
                      ? "bg-primary text-on-primary"
                      : visited
                        ? "bg-primary/20 text-primary"
                        : "bg-on-surface/[0.06] text-on-surface-variant"
                  }`}
                >
                  {active ? (
                    <motion.span
                      aria-hidden
                      layoutId="lens-tab-glow"
                      className="bg-primary/40 absolute inset-0 rounded-full blur-[6px]"
                      transition={{ type: "spring", stiffness: 280, damping: 28 }}
                    />
                  ) : null}
                  <span className="relative">{i + 1}</span>
                </span>
                <span>{l.label}</span>
                <span
                  className={`text-[10px] tabular-nums ${active ? "text-primary/70" : "text-on-surface-variant/60"}`}
                >
                  {l.sub}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <div className="border-outline-variant hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] md:flex">
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${
                done
                  ? "bg-primary"
                  : running
                    ? "bg-primary animate-pulse"
                    : "bg-on-surface-variant/50"
              }`}
            />
            <span className="font-semibold">{status}</span>
            <span className="text-on-surface-variant">·</span>
            <span className="text-on-surface-variant tabular-nums">{fmtTime(elapsedMs)}</span>
          </div>
          <ThemeToggle />
          {/* Story / Lens toggle — single binary switch in the top dock. */}
          <div
            role="tablist"
            aria-label="View mode"
            className="border-outline-variant hidden overflow-hidden rounded-full border text-[11px] md:flex"
          >
            {(["lens", "story"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 font-medium transition-colors ${
                  mode === m
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-on-surface/5"
                }`}
              >
                {m === "lens" ? "Lens" : "Story"}
              </button>
            ))}
          </div>
          {done ? <DownloadCTA /> : null}
        </div>
      </header>

      {/* MAIN — three columns: brief · stage · inspector. Brief is
          collapsible so the stage can swallow more space. The lens tabs
          in the header double as the path indicator (numbered chips). */}
      {mode === "lens" ? (
        <main
          className="relative z-10 grid min-h-0 w-full"
          style={{
            height: "calc(100dvh - 49px)",
            gridTemplateColumns: `${briefOpen ? "minmax(280px, 320px)" : "44px"} 1fr minmax(320px, 380px)`,
          }}
        >
          {/* LEFT — collapsible brief rail */}
          <BriefRail
            open={briefOpen}
            onToggle={() => setBriefOpen((v) => !v)}
            brief={brief}
            onBriefChange={setBrief}
            running={running}
            done={done}
            onRun={handleRun}
            onReset={handleReset}
            constraints={constraints}
            onToggleConstraint={toggleConstraint}
            globalCostMul={globalCostMul}
            overrideCount={Object.keys(overrides).length}
            onResetTweaks={resetTweaks}
            decisionsCount={visibleDecisions.length}
            decisionsTotal={DECISIONS.length}
            sourcesCount={SOURCES.length}
            risksCount={RISKS.length}
            monthlyCost={bomTotals.total}
          />

          {/* CENTER STAGE — switches by lens */}
          <section className="border-outline-variant relative flex min-h-0 flex-col border-x">
            <AnimatePresence mode="wait">
              <motion.div
                key={lens}
                initial={{ opacity: 0, y: 8, scale: 0.985, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -4, scale: 0.99, filter: "blur(4px)" }}
                transition={expressiveDefault}
                className="absolute inset-0 flex min-h-0 flex-col"
              >
                {lens === "architecture" ? (
                  <ArchitectureLens
                    visibleNodes={visibleNodes}
                    visibleEdges={visibleEdges}
                    done={done}
                    phaseIndex={phaseIndex}
                    selectedNodeId={selection?.kind === "node" ? selection.id : null}
                    onSelectNode={(id) => setSelection(id ? { kind: "node", id } : null)}
                    effectiveOverrides={effectiveOverrides}
                    overrides={overrides}
                    onSetOverride={setOverride}
                  />
                ) : null}
                {lens === "cost" ? (
                  <CostLens
                    totals={bomTotals}
                    users={users}
                    rps={rps}
                    gb={gb}
                    onUsers={setUsers}
                    onRps={setRps}
                    onGb={setGb}
                    selectedId={selection?.kind === "bom" ? selection.id : null}
                    onSelect={(id) => setSelection(id ? { kind: "bom", id } : null)}
                  />
                ) : null}
                {lens === "risks" ? (
                  <RisksLens
                    selectedId={selection?.kind === "risk" ? selection.id : null}
                    onSelect={(id) => setSelection(id ? { kind: "risk", id } : null)}
                  />
                ) : null}
                {lens === "decisions" ? (
                  <DecisionsLens
                    decisions={visibleDecisions}
                    total={DECISIONS.length}
                    selectedId={selection?.kind === "decision" ? selection.id : null}
                    onSelect={(id) => setSelection(id ? { kind: "decision", id } : null)}
                  />
                ) : null}
                {lens === "sequence" ? <SequenceLens /> : null}
                {lens === "package" ? <PackageLens /> : null}
                {lens === "assumptions" ? (
                  <AssumptionsLens
                    selectedId={selection?.kind === "assumption" ? selection.id : null}
                    onSelect={(id) => setSelection(id ? { kind: "assumption", id } : null)}
                  />
                ) : null}
                {lens === "roadmap" ? (
                  <RoadmapLens
                    selectedId={selection?.kind === "roadmap" ? selection.id : null}
                    onSelect={(id) => setSelection(id ? { kind: "roadmap", id } : null)}
                    onJumpToDecision={(id) => {
                      setLens("decisions");
                      setSelection({ kind: "decision", id });
                    }}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>

            {/* Floating "Next: …" pill — bottom-right of the stage. Replaces
              the old path strip's forward affordance. Only renders when
              there IS a next lens AND the run has produced something. */}
            {(() => {
              const i = LENSES.findIndex((l) => l.id === lens);
              const next = i >= 0 && i < LENSES.length - 1 ? LENSES[i + 1] : null;
              if (!next || phaseIndex < 0) return null;
              return (
                <motion.button
                  type="button"
                  onClick={() => setLens(next.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={expressiveFast}
                  className="border-primary/40 bg-surface text-primary hover:bg-primary/10 absolute bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold shadow-[0_18px_44px_-18px_rgb(0_0_0/0.45)] backdrop-blur transition-colors"
                >
                  <span
                    aria-hidden
                    className="bg-primary text-on-primary grid size-4 place-items-center rounded-full text-[9.5px] font-semibold tabular-nums"
                  >
                    {i + 2}
                  </span>
                  <span>Next · {next.label}</span>
                  <span aria-hidden>→</span>
                </motion.button>
              );
            })()}

            {/* Idle overlay removed: /decide always renders the final package. */}
          </section>

          {/* RIGHT — contextual inspector */}
          <Inspector
            selection={selection}
            onClear={() => setSelection(null)}
            selectedNode={selectedNode}
            selectedDecision={selectedDecision}
            selectedBom={selectedBom}
            selectedRisk={selectedRisk}
            decisions={visibleDecisions}
            decisionsTotal={DECISIONS.length}
            sources={SOURCES}
            onSelectDecision={(id) => setSelection({ kind: "decision", id })}
            onSelectSource={(n) => setSelection({ kind: "source", n })}
            overrides={overrides}
            effectiveOverrides={effectiveOverrides}
            onSetOverride={setOverride}
          />
        </main>
      ) : (
        <StoryView
          brief={brief}
          totals={bomTotals}
          decisions={visibleDecisions}
          done={done}
          onJumpLens={(l) => {
            setMode("lens");
            setLens(l);
          }}
        />
      )}

      {/* First-run tour tooltip — one per lens, dismissable in-memory. */}
      {mode === "lens" && showTour[lens] ? (
        <TourTooltip lens={lens} onDismiss={() => dismissTour(lens)} />
      ) : null}

      {/* FLOATING DOCK — progress timeline + cost so far */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-6">
        <div className="border-outline-variant bg-surface/90 pointer-events-auto flex max-w-[860px] items-center gap-4 rounded-full border px-5 py-2 shadow-[0_18px_60px_-30px_rgb(0_0_0/0.35)] backdrop-blur">
          <ol className="flex items-center gap-1.5">
            {PHASES.map((p, i) => {
              const state =
                done || (phaseIndex >= 0 && i < phaseIndex)
                  ? "done"
                  : currentPhase === p.id
                    ? "active"
                    : "pending";
              return (
                <li key={p.id} className="flex items-center gap-1.5">
                  <motion.span
                    aria-hidden
                    initial={false}
                    animate={{
                      backgroundColor:
                        state === "done"
                          ? "rgb(var(--md-sys-color-primary))"
                          : state === "active"
                            ? "rgb(var(--md-sys-color-primary))"
                            : "rgb(var(--md-sys-color-outline-variant))",
                      scale: state === "active" ? 1.4 : 1,
                      boxShadow:
                        state === "active"
                          ? [
                              "0 0 0 0 rgb(var(--md-sys-color-primary) / 0.55)",
                              "0 0 0 6px rgb(var(--md-sys-color-primary) / 0)",
                            ]
                          : "0 0 0 0 rgb(var(--md-sys-color-primary) / 0)",
                    }}
                    transition={
                      state === "active"
                        ? {
                            boxShadow: { duration: 1.6, repeat: Infinity, ease: "easeOut" },
                            default: expressiveFast,
                          }
                        : expressiveFast
                    }
                    className="size-2 flex-shrink-0 rounded-full"
                  />
                  {state === "active" ? (
                    <span className="text-on-surface text-[11px] font-semibold">{p.label}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <span aria-hidden className="bg-outline-variant h-4 w-px" />
          <span className="text-on-surface-variant text-xs">
            est. monthly{" "}
            <NumberRoll
              value={bomTotals.total}
              prefix="$"
              className="text-on-surface font-semibold tabular-nums"
            />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Diagram canvas ────────────────────────────────────────────── */

/** Zones shape the diagram: edge, app, and data layers, with external SaaS
 *  dependencies floating outside. We deliberately do NOT draw a "cloud
 *  provider" wrapper container — the architecture must stay portable, and a
 *  fixed wrapper would lie when org constraints swap providers underfoot. */
const ZONES: Array<{
  id: string;
  label: string;
  sub: string;
  /** % bounding box in the same 100×100 coordinate system as nodes */
  x: number;
  y: number;
  w: number;
  h: number;
  variant: "edge" | "app" | "data" | "external";
}> = [
  { id: "edge", label: "Edge", sub: "", x: 22, y: 18, w: 68, h: 14, variant: "edge" },
  {
    id: "app",
    label: "Application + messaging",
    sub: "private VNet",
    x: 22,
    y: 36,
    w: 68,
    h: 36,
    variant: "app",
  },
  {
    id: "data",
    label: "Data plane",
    sub: "private endpoint",
    x: 22,
    y: 76,
    w: 68,
    h: 18,
    variant: "data",
  },
];

function DiagramCanvas({
  nodes,
  edges,
  done,
  selectedNodeId,
  onSelectNode,
  effectiveOverrides,
  overrides,
  onSetOverride,
}: {
  nodes: ArchNode[];
  edges: ArchEdge[];
  done: boolean;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  effectiveOverrides: Record<string, string>;
  overrides: Record<string, string>;
  onSetOverride: (nodeId: string, optionId: string | null) => void;
}): React.ReactElement {
  const { nodes: NODES, componentOptions: COMPONENT_OPTIONS } = useDecideData();
  const visibleIds = new Set(nodes.map((n) => n.id));
  const liveEdges = edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));

  const getPos = useCallback((id: string): ArchNode => NODES.find((n) => n.id === id)!, []);
  const byId = (id: string): ArchNode | undefined => NODES.find((n) => n.id === id);

  return (
    <div className="absolute inset-0 overflow-hidden" onClick={() => onSelectNode(null)}>
      {/* Grid backdrop — fine dot grid + soft radial vignette. Sits behind
          the aurora orbs and the SVG. Gives the diagram a "blueprint" feel
          and makes the cards visually pop off the surface. Pure CSS, no DOM
          weight. Tinted via the on-surface token so it adapts to dark mode. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-[0.35]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 1px 1px, rgb(var(--md-sys-color-on-surface) / 0.18) 1px, transparent 0),
            radial-gradient(ellipse at 50% 40%, rgb(var(--md-sys-color-surface)) 0%, transparent 70%)
          `,
          backgroundSize: "22px 22px, 100% 100%",
          backgroundPosition: "0 0, 0 0",
          maskImage: "radial-gradient(ellipse at 50% 45%, black 55%, transparent 92%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 45%, black 55%, transparent 92%)",
        }}
      />

      {/* Ambient aurora orbs — slow, large, blurred drifts behind the diagram. */}
      <AuroraBackdrop />

      {/* SVG layer: zones + edges, scaled to a 100×100 viewBox so positions stay
          in lockstep with the absolutely-positioned cards above. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <marker
            id="arrow-sync"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--md-sys-color-primary))" />
          </marker>
          <marker
            id="arrow-async"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--md-sys-color-on-surface-variant))" />
          </marker>
          <marker
            id="arrow-data"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--md-sys-color-primary))" />
          </marker>
          <marker
            id="arrow-external"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--md-sys-color-on-surface-variant))" />
          </marker>
        </defs>

        {/* Zones (rendered before cards so they sit underneath) */}
        {ZONES.map((z) => (
          <g key={z.id}>
            <rect
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              rx="1.4"
              ry="1.4"
              fill="transparent"
              stroke="rgb(var(--md-sys-color-outline-variant))"
              strokeWidth="0.75"
              strokeOpacity={0.6}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}

        {/* Edges */}
        <AnimatePresenceSvg>
          {liveEdges.map((e) => {
            const a = byId(e.from)!;
            const b = byId(e.to)!;
            const path = edgePath(a, b, e.curve ?? 0);
            // Solid lines for all edges; differentiate by color, weight, and opacity.
            const stroke =
              e.kind === "external" || e.kind === "async"
                ? "rgb(var(--md-sys-color-on-surface-variant))"
                : "rgb(var(--md-sys-color-primary))";
            const strokeWidth = e.kind === "data" ? "1.6" : e.kind === "sync" ? "1.4" : "1.1";
            const opacity = e.kind === "external" ? 0.55 : e.kind === "async" ? 0.7 : 0.95;
            const marker =
              e.kind === "external"
                ? "url(#arrow-external)"
                : e.kind === "async"
                  ? "url(#arrow-async)"
                  : e.kind === "data"
                    ? "url(#arrow-data)"
                    : "url(#arrow-sync)";
            const edgeId = `edge-${e.from}-${e.to}`;
            // Speed of the flowing data particle (seconds for one full traversal).
            const dur =
              e.kind === "data"
                ? "1.6s"
                : e.kind === "sync"
                  ? "2.2s"
                  : e.kind === "async"
                    ? "3.4s"
                    : "4.2s";
            const particleFill =
              e.kind === "external" || e.kind === "async"
                ? "rgb(var(--md-sys-color-on-surface-variant))"
                : "rgb(var(--md-sys-color-primary))";
            return (
              <g key={edgeId}>
                <motion.path
                  id={edgeId}
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  markerEnd={marker}
                  vectorEffect="non-scaling-stroke"
                  initial={{ opacity: 0 }}
                  animate={{ opacity }}
                  transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
                />
                {/* Animated data particle — only when the edge is "live" (done). */}
                {done ? (
                  <>
                    <circle r="0.55" fill={particleFill} opacity={0.85}>
                      <animateMotion dur={dur} repeatCount="indefinite" rotate="auto">
                        <mpath href={`#${edgeId}`} />
                      </animateMotion>
                    </circle>
                    {/* Trailing ghost particle for a sense of speed */}
                    <circle r="0.32" fill={particleFill} opacity={0.4}>
                      <animateMotion
                        dur={dur}
                        repeatCount="indefinite"
                        rotate="auto"
                        begin="-0.18s"
                      >
                        <mpath href={`#${edgeId}`} />
                      </animateMotion>
                    </circle>
                  </>
                ) : null}
              </g>
            );
          })}
        </AnimatePresenceSvg>
      </svg>

      {/* Zone labels (HTML overlay so they use real type) */}
      {ZONES.map((z) => (
        <div
          key={`lbl-${z.id}`}
          className="pointer-events-none absolute"
          style={{ left: `${z.x + 0.6}%`, top: `${z.y + 0.4}%` }}
        >
          <span className="text-on-surface-variant/70 text-[9px] font-semibold uppercase tracking-[0.14em]">
            {z.label}
          </span>
          {z.sub ? (
            <span className="text-on-surface-variant/60 ml-1.5 text-[9px]">· {z.sub}</span>
          ) : null}
        </div>
      ))}

      {/* Edge labels — anchored to the bezier midpoint so they follow the
          curve, not the straight line between card centers. Survives drags. */}
      {liveEdges.map((e) => {
        if (!e.label) return null;
        const a = byId(e.from)!;
        const b = byId(e.to)!;
        const g = edgeGeom(a, b);
        const mx = g.mx;
        const my = g.my - 1.2;
        // Compact metric line: qps · p95 · retry. Only shown after `done`
        // so the canvas stays calm during the build animation.
        const metric = [e.qps, e.p95, e.retry ? `↻ ${e.retry}` : undefined]
          .filter(Boolean)
          .join("  ·  ");
        return (
          <div
            key={`elbl-${e.from}-${e.to}`}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${mx}%`, top: `${my}%` }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span className="border-outline-variant bg-surface text-on-surface-variant rounded-full border px-1.5 py-0.5 text-[9px] font-medium">
                {e.label}
              </span>
              {done && metric ? (
                <span
                  title={e.payload ? `payload: ${e.payload}` : undefined}
                  className="bg-on-surface/[0.05] text-on-surface-variant/85 rounded-full px-1.5 py-0 text-[9px] tabular-nums"
                >
                  {metric}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* Nodes — absolutely positioned cards (clickable) */}
      {NODES.map((slot) => {
        const present = nodes.find((n) => n.id === slot.id);
        const isFocused = selectedNodeId === slot.id;
        const slotOptions = COMPONENT_OPTIONS[slot.id] ?? null;
        const pos = getPos(slot.id);
        const popoverBelow = pos.y < 50;
        return (
          <div
            key={slot.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${slot.w}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ghost slot */}
            {!present ? (
              <div className="border-outline-variant/50 rounded-xl border border-dashed bg-transparent px-2.5 py-2">
                <p className="text-on-surface-variant/50 text-[10px] font-medium">{slot.label}</p>
              </div>
            ) : null}
            <AnimatePresence>
              {present ? (
                <motion.button
                  key="card"
                  type="button"
                  onClick={() => onSelectNode(isFocused ? null : slot.id)}
                  initial={{ opacity: 0, scale: 0.92, y: 6 }}
                  animate={{
                    opacity: 1,
                    scale: isFocused ? 1.04 : 1,
                    y: 0,
                    boxShadow: isFocused
                      ? "0 0 0 2px rgb(var(--md-sys-color-primary)), 0 14px 40px -18px rgb(0 0 0 / 0.32)"
                      : done
                        ? "0 0 0 1px rgb(var(--md-sys-color-primary) / 0.22), 0 6px 24px -12px rgb(0 0 0 / 0.18)"
                        : "0 4px 18px -10px rgb(0 0 0 / 0.16)",
                  }}
                  exit={{ opacity: 0 }}
                  transition={expressiveDefault}
                  whileHover={{ y: -2, scale: isFocused ? 1.05 : 1.015 }}
                  whileTap={{ scale: 0.98 }}
                  className={`bg-surface hover:border-primary/60 focus-visible:border-primary group relative flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left outline-none transition-colors ${
                    slot.zone === "external"
                      ? "border-outline-variant"
                      : slot.zone === "client"
                        ? "border-outline-variant"
                        : "border-outline"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid size-7 flex-shrink-0 place-items-center rounded-lg ${
                      slot.zone === "external"
                        ? "bg-on-surface/5 text-on-surface-variant"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <NodeIcon name={slot.icon} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-on-surface truncate text-[11px] font-semibold leading-tight">
                        {present.label}
                      </p>
                      <span className="flex shrink-0 items-center gap-1">
                        {slot.dataClass ? <DataClassDot c={slot.dataClass} /> : null}
                        <CiteMark n={slot.cite} />
                      </span>
                    </div>
                    <p className="text-on-surface-variant mt-0.5 truncate text-[10px]">
                      {present.sub}
                    </p>
                    {slot.scaleChip ? (
                      <p className="bg-primary/8 text-primary mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium">
                        <span aria-hidden className="bg-primary size-1 rounded-full" />
                        <span className="truncate">{slot.scaleChip}</span>
                      </p>
                    ) : null}
                  </div>
                  {/* Swap affordance — small ↹ glyph in the corner of every
                      tweakable component, so users discover the popover. */}
                  {slotOptions ? (
                    <span
                      aria-hidden
                      title="Swap available"
                      className={`absolute right-1.5 top-1.5 grid size-3.5 place-items-center rounded-full text-[8px] font-bold leading-none transition-colors ${
                        slot.id in overrides
                          ? "bg-primary text-on-primary"
                          : "bg-on-surface/[0.06] text-on-surface-variant group-hover:bg-primary/15 group-hover:text-primary"
                      }`}
                    >
                      ↹
                    </span>
                  ) : null}
                </motion.button>
              ) : null}
            </AnimatePresence>

            {/* Inline swap popover — appears above/below the focused card when
                this node has alternatives. Click the option, diagram repaints. */}
            <AnimatePresence>
              {present && isFocused && slotOptions ? (
                <motion.div
                  key="popover"
                  initial={{ opacity: 0, y: popoverBelow ? -6 : 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: popoverBelow ? -6 : 6, scale: 0.96 }}
                  transition={expressiveFast}
                  className={`border-outline bg-surface absolute left-1/2 z-30 w-[260px] -translate-x-1/2 rounded-2xl border p-2 shadow-[0_22px_60px_-22px_rgb(0_0_0/0.45)] backdrop-blur ${
                    popoverBelow ? "top-full mt-3" : "bottom-full mb-3"
                  }`}
                >
                  {/* Pointer / connector to the card */}
                  <span
                    aria-hidden
                    className={`border-outline bg-surface absolute left-1/2 size-2.5 -translate-x-1/2 rotate-45 ${
                      popoverBelow ? "-top-1 border-l border-t" : "-bottom-1 border-b border-r"
                    }`}
                  />
                  <div className="flex items-baseline justify-between px-1.5 pb-1.5 pt-1">
                    <span className="text-primary text-[9.5px] font-semibold uppercase tracking-[0.14em]">
                      Swap component
                    </span>
                    {slot.id in overrides ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetOverride(slot.id, null);
                          onSelectNode(null);
                        }}
                        className="text-on-surface-variant hover:text-on-surface text-[9.5px] font-semibold uppercase tracking-wider hover:underline"
                      >
                        ↺ Reset
                      </button>
                    ) : null}
                  </div>
                  <ul className="space-y-0.5">
                    {slotOptions.map((o) => {
                      const activeId = effectiveOverrides[slot.id] ?? slotOptions[0]!.id;
                      const active = o.id === activeId;
                      const deltaPct = Math.round((o.costMul - 1) * 100);
                      return (
                        <li key={o.id}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetOverride(slot.id, o.id === slotOptions[0]!.id ? null : o.id);
                              onSelectNode(null);
                            }}
                            className={`group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                              active ? "bg-primary/[0.10]" : "hover:bg-on-surface/[0.04]"
                            }`}
                          >
                            <span
                              aria-hidden
                              className={`mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border ${
                                active
                                  ? "border-primary bg-primary text-on-primary"
                                  : "border-outline-variant"
                              }`}
                            >
                              {active ? (
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                  <path
                                    d="M1.5 4.2 L3.4 6 L6.5 2.5"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span
                                  className={`truncate text-[11px] font-semibold ${
                                    active ? "text-primary" : "text-on-surface"
                                  }`}
                                >
                                  {o.label}
                                </span>
                                <span
                                  className={`shrink-0 text-[9.5px] font-semibold tabular-nums ${
                                    o.remove
                                      ? "text-on-surface-variant"
                                      : deltaPct > 0
                                        ? "text-error"
                                        : deltaPct < 0
                                          ? "text-primary"
                                          : "text-on-surface-variant"
                                  }`}
                                >
                                  {o.remove
                                    ? "remove"
                                    : deltaPct === 0
                                      ? "baseline"
                                      : `${deltaPct > 0 ? "+" : ""}${deltaPct}%`}
                                </span>
                              </span>
                              <span className="text-on-surface-variant block truncate text-[10px]">
                                {o.sub}
                              </span>
                              {active ? (
                                <span className="text-on-surface mt-0.5 block text-[10px] leading-snug">
                                  {o.note}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** AnimatePresence wrapped with a no-op so SVG children animate cleanly. */
function AnimatePresenceSvg({ children }: { children: React.ReactNode }): React.ReactElement {
  return <AnimatePresence initial={true}>{children}</AnimatePresence>;
}

/** Compute the geometry of the bezier between two cards: exit/entry
 *  points (clipped to each card's perimeter, with arrow-marker inset),
 *  control points, and the bezier midpoint at t=0.5 (used to anchor
 *  edge labels to the actual curve, not to the straight line between
 *  centers). Cards are treated as axis-aligned rects with horizontal
 *  half-extent = slot.w/2 and vertical half-extent = 3.4 viewBox units. */
function edgeGeom(
  a: ArchNode,
  b: ArchNode,
): {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  mx: number;
  my: number;
} {
  const aHW = a.w / 2;
  const bHW = b.w / 2;
  const HH = 3.4;
  const inset = 0.3;

  const exit = (
    cx: number,
    cy: number,
    hw: number,
    hh: number,
    tx: number,
    ty: number,
  ): { x: number; y: number; axis: "x" | "y" } => {
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy, axis: "x" };
    const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
    const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
    const s = Math.min(sx, sy);
    const axis: "x" | "y" = sx < sy ? "x" : "y";
    return { x: cx + dx * s, y: cy + dy * s, axis };
  };

  const ea = exit(a.x, a.y, aHW, HH, b.x, b.y);
  const eb = exit(b.x, b.y, bHW, HH, a.x, a.y);

  const segDx = eb.x - ea.x;
  const segDy = eb.y - ea.y;
  const segLen = Math.max(Math.hypot(segDx, segDy), 0.001);
  const nx = segDx / segLen;
  const ny = segDy / segLen;
  const ax = ea.x + nx * inset;
  const ay = ea.y + ny * inset;
  const bx = eb.x - nx * inset;
  const by = eb.y - ny * inset;

  // Control-point pull. Lighter (0.32 of span) than before so curves
  // stay direct when cards have been dragged into unusual positions —
  // avoids loopy lines that overshoot other cards.
  const span = Math.max(Math.hypot(bx - ax, by - ay), 6);
  const k = 0.32 * span;
  const c1x = ea.axis === "y" ? ax : ax + nx * k * 0.6;
  const c1y = ea.axis === "y" ? ay + Math.sign(by - ay) * k : ay;
  const c2x = eb.axis === "y" ? bx : bx - nx * k * 0.6;
  const c2y = eb.axis === "y" ? by - Math.sign(by - ay) * k : by;

  // Bezier point at t=0.5 — the actual visual midpoint of the curve.
  // P(0.5) = 0.125·P0 + 0.375·P1 + 0.375·P2 + 0.125·P3
  const mx = 0.125 * ax + 0.375 * c1x + 0.375 * c2x + 0.125 * bx;
  const my = 0.125 * ay + 0.375 * c1y + 0.375 * c2y + 0.125 * by;

  return { ax, ay, bx, by, c1x, c1y, c2x, c2y, mx, my };
}

function edgePath(a: ArchNode, b: ArchNode, _curve: number): string {
  const g = edgeGeom(a, b);
  return `M ${g.ax} ${g.ay} C ${g.c1x} ${g.c1y}, ${g.c2x} ${g.c2y}, ${g.bx} ${g.by}`;
}

/**
 * AuroraBackdrop — three slowly drifting, blurred coloured orbs sitting behind
 * the architecture canvas. They're absolutely positioned, pointer-events:none,
 * and tinted with theme tokens so dark/light always reads cleanly. Pure visual
 * delight; no interaction, no semantics.
 */
function AuroraBackdrop(): React.ReactElement {
  const orbs = [
    {
      color: "var(--md-sys-color-primary)",
      x: "12%",
      y: "18%",
      size: 360,
      dx: 28,
      dy: -18,
      dur: 26,
    },
    {
      color: "var(--md-sys-color-tertiary)",
      x: "62%",
      y: "12%",
      size: 320,
      dx: -22,
      dy: 24,
      dur: 32,
    },
    {
      color: "var(--md-sys-color-secondary)",
      x: "40%",
      y: "72%",
      size: 420,
      dx: 20,
      dy: -14,
      dur: 38,
    },
  ] as const;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: o.x,
            top: o.y,
            width: o.size,
            height: o.size,
            background: `radial-gradient(circle at 30% 30%, rgb(${o.color} / 0.18), rgb(${o.color} / 0) 70%)`,
            filter: "blur(40px)",
          }}
          initial={{ x: 0, y: 0, scale: 1 }}
          animate={{ x: [0, o.dx, 0], y: [0, o.dy, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/**
 * NumberRoll — animates a number to a target value with a spring. Used for the
 * monthly cost total in the header dock so changes to the projection feel
 * tactile. Renders a tabular-nums span so the surrounding layout never jitters.
 */
function NumberRoll({
  value,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}): React.ReactElement {
  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.6 });
  const display = useTransform(
    spring,
    (latest) => `${prefix}${Math.round(latest).toLocaleString()}${suffix}`,
  );
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <motion.span className={className}>{display}</motion.span>;
}

function NodeIcon({ name }: { name: ArchNode["icon"] }): React.ReactElement {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
        </svg>
      );
    case "cpu":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
        </svg>
      );
    case "queue":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="6" height="12" rx="1" />
          <rect x="11" y="6" width="6" height="12" rx="1" />
          <path d="M19 8v8" />
        </svg>
      );
    case "flash":
      return (
        <svg {...common}>
          <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7z" />
        </svg>
      );
    case "db":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      );
    case "bucket":
      return (
        <svg {...common}>
          <path d="M5 7h14l-1.5 12a2 2 0 0 1-2 1.7H8.5a2 2 0 0 1-2-1.7L5 7zM4 7l1-3h14l1 3" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l4 4M14 14l4 4M18 6l-4 4M10 14l-4 4" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 11h18M7 16h3" />
        </svg>
      );
  }
}

/** Tiny coloured dot used on architecture node cards to surface
 *  data classification at a glance. Tooltip explains it. */
const DATA_CLASS_COLOR: Record<NonNullable<ArchNode["dataClass"]>, string> = {
  pii: "rgb(220 70 90)",
  payment: "rgb(245 160 60)",
  secret: "rgb(110 90 220)",
  internal: "rgb(80 140 200)",
  public: "rgb(120 180 130)",
};
const DATA_CLASS_LABEL: Record<NonNullable<ArchNode["dataClass"]>, string> = {
  pii: "Holds PII",
  payment: "Holds payment data",
  secret: "Holds secrets",
  internal: "Internal data",
  public: "Public / non-sensitive",
};
function DataClassDot({ c }: { c: NonNullable<ArchNode["dataClass"]> }): React.ReactElement {
  return (
    <span
      aria-label={DATA_CLASS_LABEL[c]}
      title={DATA_CLASS_LABEL[c]}
      className="ring-surface size-1.5 shrink-0 rounded-full ring-1"
      style={{ background: DATA_CLASS_COLOR[c] }}
    />
  );
}

/* ─── Bits ─────────────────────────────────────────────────────── */

function BriefField({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <motion.div
      whileHover={{ y: -1, borderColor: "rgb(var(--md-sys-color-primary) / 0.5)" }}
      transition={expressiveFast}
      className="border-outline-variant rounded-lg border px-3 py-2"
    >
      <p className="text-on-surface-variant text-[10px] font-medium uppercase tracking-wider">
        {label}
      </p>
      <p className="text-on-surface mt-0.5 text-xs">{value}</p>
    </motion.div>
  );
}

/* ─── DownloadCTA ─────────────────────────────────────────────────
 *
 * The header CTA shown once a run completes. Hand-rolled rather than
 * the stock Button so we can:
 *   • Spring-in with a small overshoot when `done` flips
 *   • Run a one-shot sheen sweep across the surface to draw the eye
 *   • Animate the arrow on hover (down-bounce)
 *   • Show a satisfying scale-pop on click
 */
function DownloadCTA(): React.ReactElement {
  const meta = useDecideRun();
  const href =
    meta.pdfHref ?? (meta.runId ? `/api/runs/${meta.runId}/artifact/package_pdf` : undefined);
  const tag = href ? motion.a : motion.button;
  const tagProps = href
    ? ({ href, target: "_blank", rel: "noopener" } as const)
    : ({ type: "button" } as const);
  // Cast through unknown so the union of (a|button) prop signatures merges
  // cleanly under TypeScript without losing motion's variant types.
  const Tag = tag as unknown as typeof motion.button;
  return (
    <Tag
      {...(tagProps as unknown as Record<string, unknown>)}
      initial={{ opacity: 0, y: -8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 360, damping: 22, mass: 0.6 }}
      whileHover={{ y: -1, scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      className="bg-primary text-on-primary focus-visible:ring-primary/40 group relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full pl-3 pr-3.5 text-[12px] font-semibold shadow-[0_8px_22px_-8px_rgb(var(--md-sys-color-primary)/0.55)] outline-none transition-shadow hover:shadow-[0_14px_30px_-10px_rgb(var(--md-sys-color-primary)/0.7)] focus-visible:ring-2"
    >
      {/* one-shot sheen sweep, fires on mount */}
      <motion.span
        aria-hidden
        initial={{ x: "-120%" }}
        animate={{ x: "180%" }}
        transition={{ delay: 0.35, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        className="via-on-primary/35 pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent to-transparent"
      />
      <motion.svg
        aria-hidden
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        className="relative"
        initial={{ y: 0 }}
        whileHover={{ y: [0, 2, 0] }}
        transition={{ duration: 0.55, repeat: Infinity, repeatDelay: 0.4 }}
      >
        <path
          d="M8 2v8M4.5 7l3.5 3.5L11.5 7M3 13h10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
      <span className="relative">Download</span>
      <span
        aria-hidden
        className="bg-on-primary/20 relative -mr-0.5 ml-0.5 rounded-full px-1.5 py-px text-[9.5px] font-bold tracking-wide"
      >
        PDF
      </span>
    </Tag>
  );
}

function CiteMark({ n }: { n: number }): React.ReactElement {
  return (
    <span className="bg-primary/10 text-primary inline-grid size-4 place-items-center rounded-full text-[9px] font-semibold tabular-nums">
      {n}
    </span>
  );
}

function ConfPill({ conf }: { conf: "low" | "med" | "high" }): React.ReactElement {
  const map = {
    high: "bg-primary/10 text-primary",
    med: "bg-on-surface/10 text-on-surface-variant",
    low: "bg-on-surface/5 text-on-surface-variant",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${map[conf]}`}
    >
      {conf}
    </span>
  );
}

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** MobileGate — /decide is a desktop-class lens layout (3 columns + dense
 *  inspector). On viewports below `lg` (1024px) the layout would crush
 *  unusably, so we render an honest interstitial instead. Mobile is an
 *  out-of-MVP-scope concern per product-goals. */
function MobileGate(): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-label="Open on a wider screen"
      className="bg-surface absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 px-6 text-center lg:hidden"
    >
      <span
        aria-hidden
        className="bg-primary/10 text-primary grid size-12 place-items-center rounded-full"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </span>
      <div className="max-w-xs">
        <h1 className="text-on-surface text-balance text-lg font-semibold">
          The package opens best on a wider screen
        </h1>
        <p className="text-on-surface-variant mt-2 text-[13px] leading-relaxed">
          The /decide view is dense by design — diagrams, BOM tables, and a live inspector. Open it
          on a tablet or laptop ({"\u2265"} 1024 px wide) for the full experience.
        </p>
      </div>
      <Link
        href="/"
        className="border-outline-variant text-on-surface hover:bg-on-surface/5 rounded-full border px-4 py-1.5 text-[12.5px] font-semibold"
      >
        Back to home
      </Link>
    </div>
  );
}

/* ─── BriefRail (collapsible) ─────────────────────────────────── */

function BriefRail({
  open,
  onToggle,
  brief,
  onBriefChange,
  running,
  done,
  onRun,
  onReset,
  constraints,
  onToggleConstraint,
  globalCostMul,
  overrideCount,
  onResetTweaks,
  decisionsCount,
  decisionsTotal,
  sourcesCount,
  risksCount,
  monthlyCost,
}: {
  open: boolean;
  onToggle: () => void;
  brief: string;
  onBriefChange: (v: string) => void;
  running: boolean;
  done: boolean;
  onRun: () => void;
  onReset: () => void;
  constraints: Set<string>;
  onToggleConstraint: (id: string) => void;
  globalCostMul: number;
  overrideCount: number;
  onResetTweaks: () => void;
  decisionsCount: number;
  decisionsTotal: number;
  sourcesCount: number;
  risksCount: number;
  monthlyCost: number;
}): React.ReactElement {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Open brief"
        className="border-outline-variant bg-surface/60 text-on-surface-variant hover:bg-on-surface/5 group flex h-full flex-col items-center justify-start gap-3 border-r py-4"
      >
        <span className="bg-primary/10 text-primary grid size-7 place-items-center rounded-full">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        <span className="rotate-180 text-[10px] font-semibold uppercase tracking-[0.18em] [writing-mode:vertical-rl]">
          The brief
        </span>
      </button>
    );
  }
  return (
    <section className="border-outline-variant bg-surface/60 flex min-h-0 flex-col border-r backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <span className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
          The brief
        </span>
        <button
          type="button"
          onClick={onToggle}
          title="Collapse"
          className="text-on-surface-variant hover:bg-on-surface/5 grid size-6 place-items-center rounded-full"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
        <div className="space-y-2">
          <label className="text-on-surface-variant block text-[10px] font-semibold uppercase tracking-wider">
            What are you building?
          </label>
          <textarea
            value={brief}
            onChange={(e) => onBriefChange(e.target.value)}
            disabled={running}
            rows={5}
            className="border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant focus:border-primary min-h-[110px] w-full resize-none rounded-xl border px-3 py-2.5 text-sm leading-relaxed focus:outline-none disabled:opacity-60"
            placeholder="Describe the system in plain words…"
          />
        </div>

        <div className="space-y-1">
          <BriefField label="Cloud preference" value="Azure first · AWS / GCP secondary" />
          <BriefField label="Budget" value="< $400 / month at launch" />
          <BriefField label="Region" value="EU residency required" />
          <BriefField label="Regret if…" value="Can't migrate off the DB later" />
        </div>

        {/* ── Solution insights ────────────────────────────────────
            Key facts the brief is being designed against. Static
            (sourced from the brief), but always visible so the user
            sees what the run is targeting. */}
        <section className="border-outline-variant bg-surface-container-lowest/40 rounded-xl border p-2.5">
          <span className="text-on-surface-variant block pb-1.5 text-[10px] font-semibold uppercase tracking-wider">
            Solution insights
          </span>
          <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
            <InsightStat label="Target users" value="5,000 MAU" sub="at launch" />
            <InsightStat label="Peak load" value="~50 RPS" sub="p95 200 ms" />
            <InsightStat label="Data volume" value="~200 GB" sub="yr 1" />
            <InsightStat label="Availability" value="99.9 %" sub="single region" />
            <InsightStat label="Workload" value="B2B SaaS" sub="multi-tenant" />
            <InsightStat label="Compliance" value="GDPR" sub="EU data resident" />
          </dl>
          {overrideCount > 0 ? (
            <div className="border-outline-variant/60 text-on-surface-variant mt-2 flex items-baseline justify-between border-t pt-1.5 text-[10px]">
              <span>
                <span className="text-primary font-semibold">{overrideCount}</span> component
                {overrideCount === 1 ? "" : "s"} swapped on diagram
              </span>
              <button
                type="button"
                onClick={onResetTweaks}
                className="hover:text-on-surface font-semibold uppercase tracking-wider hover:underline"
              >
                ↺ Reset
              </button>
            </div>
          ) : null}
          {globalCostMul !== 1 ? (
            <p className="text-on-surface-variant mt-1 text-[10px]">
              Global cost ×{" "}
              <span className="text-on-surface font-semibold tabular-nums">
                {globalCostMul.toFixed(2)}
              </span>
            </p>
          ) : null}
        </section>

        {/* ── Run snapshot ─────────────────────────────────────────
            Always-visible at-a-glance numbers from this run. Useful
            once the run is done; muted while idle. */}
        <section
          className={`border-outline-variant rounded-xl border p-2.5 ${done ? "bg-surface" : "bg-surface-container-lowest/40 opacity-70"}`}
        >
          <span className="text-on-surface-variant block pb-1.5 text-[10px] font-semibold uppercase tracking-wider">
            Run snapshot
          </span>
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <SnapshotStat label="Decisions" value={`${decisionsCount}/${decisionsTotal}`} />
            <SnapshotStat label="Sources cited" value={String(sourcesCount)} />
            <SnapshotStat label="Risks flagged" value={String(risksCount)} />
            <SnapshotStat
              label="Est. monthly"
              value={`$${Math.round(monthlyCost).toLocaleString()}`}
            />
          </dl>
        </section>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <p className="text-on-surface-variant text-[10.5px]">
            Final package · produced from this brief on the previous step
          </p>
        </div>
      </div>
    </section>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1, backgroundColor: "rgb(var(--md-sys-color-on-surface) / 0.06)" }}
      transition={expressiveFast}
      className="bg-on-surface/[0.03] rounded-lg px-2 py-1.5"
    >
      <dt className="text-on-surface-variant text-[9.5px] font-semibold uppercase tracking-wider">
        {label}
      </dt>
      <motion.dd
        key={value}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={expressiveFast}
        className="text-on-surface mt-0.5 text-[13px] font-semibold tabular-nums"
      >
        {value}
      </motion.dd>
    </motion.div>
  );
}

function InsightStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}): React.ReactElement {
  return (
    <motion.div
      whileHover={{ y: -1, backgroundColor: "rgb(var(--md-sys-color-on-surface) / 0.06)" }}
      transition={expressiveFast}
      className="bg-on-surface/[0.03] rounded-lg px-2 py-1.5"
    >
      <dt className="text-on-surface-variant text-[9px] font-semibold uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-on-surface mt-0.5 text-[12px] font-semibold tabular-nums">{value}</dd>
      <dd className="text-on-surface-variant text-[9.5px]">{sub}</dd>
    </motion.div>
  );
}

/* ─── ArchitectureLens ────────────────────────────────────────── */

function ArchitectureLens({
  visibleNodes,
  visibleEdges,
  done,
  phaseIndex: _phaseIndex,
  selectedNodeId,
  onSelectNode,
  effectiveOverrides,
  overrides,
  onSetOverride,
}: {
  visibleNodes: ArchNode[];
  visibleEdges: ArchEdge[];
  done: boolean;
  phaseIndex: number;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  effectiveOverrides: Record<string, string>;
  overrides: Record<string, string>;
  onSetOverride: (nodeId: string, optionId: string | null) => void;
}): React.ReactElement {
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <DiagramCanvas
          nodes={visibleNodes}
          edges={visibleEdges}
          done={done}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          effectiveOverrides={effectiveOverrides}
          overrides={overrides}
          onSetOverride={onSetOverride}
        />
      </div>
      <FlowNarrative
        open={narrativeOpen}
        onToggle={() => setNarrativeOpen((v) => !v)}
        onHighlight={onSelectNode}
        highlightedId={selectedNodeId}
      />
    </div>
  );
}

/* ─── FlowNarrative ───────────────────────────────────────────── */
/* A bottom-anchored, collapsible explainer that walks through the
   request lifecycle as numbered steps. Each step names the components
   it touches and explains *why* they're there — turning the diagram
   from a static picture into a story the reader can follow. Hovering
   a step highlights the corresponding component on the canvas. */

const FLOW_STEPS: Array<{
  id: string;
  title: string;
  nodes: string[];
  body: string;
}> = [
  {
    id: "f-1",
    title: "User submits a brief",
    nodes: ["user", "lb", "web"],
    body: "The browser POSTs to /api/runs through Front Door + WAF, which terminates TLS, blocks bad actors, and forwards to the nearest tessar-web replica. Next.js validates the brief with Zod and writes a row to Postgres in a single round-trip.",
  },
  {
    id: "f-2",
    title: "Web hands the run to the worker",
    nodes: ["web", "queue", "worker"],
    body: "Instead of running the 12-minute graph inline, web publishes a RunSpec to Service Bus. The worker pulls with managed-identity auth and concurrency=1 — each run gets its own clean process, no shared LangGraph state, and Service Bus’s DLQ catches anything that fails 5× retries.",
  },
  {
    id: "f-3",
    title: "Worker streams progress live",
    nodes: ["worker", "redis", "web", "user"],
    body: "As each agent completes a node, the worker writes an event to a Redis Stream. tessar-web subscribes and pushes them down a single SSE connection to the browser — no WebSocket infra, no polling, and a viewer joining late replays from the stream cursor.",
  },
  {
    id: "f-4",
    title: "Agents research, pick, and justify",
    nodes: ["worker", "vertex"],
    body: "Tier-B models (GPT-4o-mini) run the parallel research workers; tier-A (GPT-5) runs synthesis, architect, and risk writer. The router fails over Azure OpenAI → Anthropic on Foundry → OpenAI direct on quota errors, all inside the Azure data boundary.",
  },
  {
    id: "f-5",
    title: "Artifacts land in durable storage",
    nodes: ["worker", "db", "storage"],
    body: "Structured output (decisions, BOM, risks) goes to Postgres; the rendered PDF + Markdown go to Blob Storage behind signed URLs with a 30-day Cool-tier lifecycle. Postgres + pgvector double as the KB store at MVP — one DB to operate.",
  },
  {
    id: "f-6",
    title: "User pays, downloads, owns the package",
    nodes: ["web", "stripe", "user"],
    body: "Stripe Checkout handles payment; the signed webhook flips the run to paid and unlocks the download. The user gets a self-contained PDF + Markdown — no lock-in, no hidden state. Pay-per-outcome, in their hands.",
  },
];

function FlowNarrative({
  open,
  onToggle,
  onHighlight,
  highlightedId,
}: {
  open: boolean;
  onToggle: () => void;
  onHighlight: (id: string | null) => void;
  highlightedId: string | null;
}): React.ReactElement {
  const { nodes: NODES } = useDecideData();
  return (
    <div className="border-outline-variant bg-surface/85 relative z-20 border-t backdrop-blur">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-on-surface/[0.03] group flex w-full items-center justify-between gap-3 px-8 py-2.5 text-left transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="bg-primary/12 text-primary grid size-5 place-items-center rounded-full text-[11px] font-bold"
          >
            ?
          </span>
          <span className="text-on-surface text-[12px] font-semibold">How this works</span>
          <span className="text-on-surface-variant text-[11px]">
            · {FLOW_STEPS.length}-step request lifecycle
          </span>
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={expressiveFast}
          className="text-on-surface-variant group-hover:text-primary text-[14px] leading-none"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expressiveDefault}
            className="overflow-hidden"
          >
            <ol className="grid gap-3 px-8 pb-5 pt-1 md:grid-cols-2 xl:grid-cols-3">
              {FLOW_STEPS.map((step, i) => {
                const isHot = highlightedId !== null && step.nodes.includes(highlightedId);
                return (
                  <motion.li
                    key={step.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...expressiveDefault, delay: i * 0.04 }}
                    onMouseEnter={() => onHighlight(step.nodes[0] ?? null)}
                    onMouseLeave={() => onHighlight(null)}
                    className={`bg-surface group relative rounded-xl border px-3 py-2.5 transition-colors ${
                      isHot
                        ? "border-primary/60 bg-primary/[0.04]"
                        : "border-outline-variant hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold tabular-nums transition-colors ${
                          isHot ? "bg-primary text-on-primary" : "bg-primary/10 text-primary"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-on-surface text-[11.5px] font-semibold leading-tight">
                          {step.title}
                        </p>
                        <p className="text-on-surface-variant mt-1 text-[11px] leading-snug">
                          {step.body}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {step.nodes.map((nid) => {
                            const n = NODES.find((x) => x.id === nid);
                            if (!n) return null;
                            const active = highlightedId === nid;
                            return (
                              <button
                                key={nid}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onHighlight(active ? null : nid);
                                }}
                                onMouseEnter={(e) => {
                                  e.stopPropagation();
                                  onHighlight(nid);
                                }}
                                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium transition-colors ${
                                  active
                                    ? "bg-primary text-on-primary"
                                    : "bg-on-surface/[0.05] text-on-surface-variant hover:bg-primary/15 hover:text-primary"
                                }`}
                              >
                                <span
                                  aria-hidden
                                  className="size-1 rounded-full bg-current opacity-70"
                                />
                                {n.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ─── CostLens ────────────────────────────────────────────────── */

function CostLens({
  totals,
  users,
  rps,
  gb,
  onUsers,
  onRps,
  onGb,
  selectedId,
  onSelect,
}: {
  totals: { lines: { line: BomLine; cost: number }[]; total: number };
  users: number;
  rps: number;
  gb: number;
  onUsers: (v: number) => void;
  onRps: (v: number) => void;
  onGb: (v: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): React.ReactElement {
  const sorted = [...totals.lines].sort((a, b) => b.cost - a.cost);
  const max = sorted.length > 0 ? sorted[0]!.cost : 1;
  // Per-run unit economics — price is fixed at MVP, variable cost is the LLM/search slice.
  const PRICE_PER_RUN = 49;
  const RUNS_PER_MONTH = 80; // assume 80 paid runs / mo at this scale
  const variableSlice = sorted
    .filter(({ line }) => line.kind === "vendor" || line.kind === "compute")
    .reduce((s, x) => s + x.cost, 0);
  const variablePerRun = variableSlice / RUNS_PER_MONTH;
  const margin = ((PRICE_PER_RUN - variablePerRun) / PRICE_PER_RUN) * 100;
  // Variable vs fixed split
  const fixedTotal = sorted.filter(({ line }) => line.fixed).reduce((s, x) => s + x.cost, 0);
  const varTotal = totals.total - fixedTotal;
  const fixedPct = (fixedTotal / Math.max(1, totals.total)) * 100;
  // Avg free-tier coverage, weighted by base cost
  const freeWeighted = sorted
    .filter(({ line }) => typeof line.freeTierPct === "number")
    .reduce((s, x) => s + (x.line.freeTierPct ?? 0) * x.cost, 0);
  const avgFreePct = freeWeighted / Math.max(1, totals.total);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top: scale knobs + total */}
      <div className="border-outline-variant grid gap-4 border-b px-8 pb-5 pt-6 md:grid-cols-[1fr_auto]">
        <div className="grid gap-3 md:grid-cols-3">
          <Knob
            label="Users"
            value={users}
            min={1}
            max={100}
            step={1}
            onChange={onUsers}
            unit="×"
            hint={`${(users * 1000).toLocaleString()} / mo`}
          />
          <Knob
            label="RPS"
            value={rps}
            min={1}
            max={100}
            step={1}
            onChange={onRps}
            unit="×"
            hint={`${(rps * 12).toFixed(0)} req/s peak`}
          />
          <Knob
            label="Storage"
            value={gb}
            min={1}
            max={500}
            step={1}
            onChange={onGb}
            unit="×"
            hint={`${(gb * 80).toLocaleString()} GB`}
          />
        </div>
        <div className="flex flex-col items-start justify-center md:items-end">
          <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
            Estimated monthly
          </span>
          <span className="text-on-surface text-3xl font-semibold tabular-nums">
            ${totals.total.toFixed(0)}
          </span>
          <span className="text-on-surface-variant text-[11px]">
            {users === 1 && rps === 1 && gb === 1 ? "at brief baseline" : "at current scale"}
          </span>
        </div>
      </div>

      {/* Insight strip — per-run economics, variable/fixed donut, free-tier coverage */}
      <div className="border-outline-variant grid grid-cols-2 gap-3 border-b px-8 py-4 md:grid-cols-4">
        <div className="border-outline-variant bg-surface rounded-xl border px-3 py-2.5">
          <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            Per-run economics
          </p>
          <p className="text-on-surface mt-1 text-lg font-semibold tabular-nums">
            ${PRICE_PER_RUN}{" "}
            <span className="text-on-surface-variant text-xs font-normal">price</span>
            <span className="text-on-surface-variant/60 px-1">−</span>${variablePerRun.toFixed(2)}{" "}
            <span className="text-on-surface-variant text-xs font-normal">variable</span>
          </p>
          <p className="text-on-surface-variant mt-0.5 text-[11px]">
            margin{" "}
            <span
              className={`font-semibold tabular-nums ${margin >= 70 ? "text-primary" : margin >= 40 ? "text-on-surface" : "text-error"}`}
            >
              {margin.toFixed(0)}%
            </span>{" "}
            · assumes {RUNS_PER_MONTH} runs / mo
          </p>
        </div>
        <div className="border-outline-variant bg-surface rounded-xl border px-3 py-2.5">
          <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            Variable vs fixed
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Donut pct={fixedPct} />
            <div className="text-on-surface-variant text-[11px] leading-tight">
              <p>
                <span className="bg-primary inline-block size-2 rounded-full align-middle" /> Fixed
                ${fixedTotal.toFixed(0)}
              </p>
              <p className="mt-0.5">
                <span className="bg-outline-variant inline-block size-2 rounded-full align-middle" />{" "}
                Variable ${varTotal.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
        <div className="border-outline-variant bg-surface rounded-xl border px-3 py-2.5">
          <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            Free-tier coverage
          </p>
          <p className="text-on-surface mt-1 text-lg font-semibold tabular-nums">
            {avgFreePct.toFixed(0)}
            <span className="text-on-surface-variant text-sm font-normal">%</span>
          </p>
          <div className="bg-outline-variant/50 mt-1.5 h-1.5 overflow-hidden rounded-full">
            <span
              className="bg-primary/70 block h-full rounded-full"
              style={{ width: `${Math.min(100, avgFreePct)}%` }}
            />
          </div>
          <p className="text-on-surface-variant mt-1 text-[10px]">weighted across all SKUs</p>
        </div>
        <div className="border-outline-variant bg-surface rounded-xl border px-3 py-2.5">
          <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            12-mo projection
          </p>
          <Sparkline base={totals.total} growthMoM={0.1} />
          <p className="text-on-surface-variant mt-1 text-[10px]">
            @ 10% MoM user growth → ${(totals.total * Math.pow(1.1, 11)).toFixed(0)} / mo by month
            12
          </p>
        </div>
      </div>

      {/* BOM table — clickable rows */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-4">
        <div className="text-on-surface-variant grid grid-cols-[1.4fr_1.1fr_2fr_auto] gap-3 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider">
          <span>Service</span>
          <span>SKU</span>
          <span>Share of cost</span>
          <span className="text-right">$ / mo</span>
        </div>
        <ul className="divide-outline-variant divide-y">
          {sorted.map(({ line, cost }) => {
            const pct = (cost / max) * 100;
            const totalPct = (cost / totals.total) * 100;
            const active = selectedId === line.id;
            return (
              <li key={line.id}>
                <button
                  type="button"
                  onClick={() => onSelect(active ? null : line.id)}
                  className={`grid w-full grid-cols-[1.4fr_1.1fr_2fr_auto] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
                    active ? "bg-primary/8" : "hover:bg-on-surface/5"
                  }`}
                >
                  <span className="text-on-surface flex items-center gap-2 text-sm font-semibold">
                    {line.service}
                    {line.fixed ? (
                      <span
                        title="Fixed cost regardless of traffic"
                        className="border-outline-variant text-on-surface-variant rounded-full border px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider"
                      >
                        fixed
                      </span>
                    ) : null}
                    {typeof line.freeTierPct === "number" && line.freeTierPct > 0 ? (
                      <span
                        title={`${line.freeTierPct}% covered by free tier`}
                        className="border-primary/40 bg-primary/5 text-primary rounded-full border px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider"
                      >
                        free {line.freeTierPct}%
                      </span>
                    ) : null}
                  </span>
                  <span className="text-on-surface-variant truncate text-xs">{line.sku}</span>
                  <span className="flex items-center gap-2">
                    <span className="bg-outline-variant/40 relative h-1.5 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-primary absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-on-surface-variant w-10 text-right text-[10px] tabular-nums">
                      {totalPct.toFixed(0)}%
                    </span>
                  </span>
                  <span className="text-on-surface w-16 text-right text-sm font-semibold tabular-nums">
                    ${cost.toFixed(cost < 10 ? 2 : 0)}
                  </span>
                </button>
                {line.cliff ? (
                  <div className="border-error/40 bg-error/[0.04] mb-2 ml-2 mt-0.5 flex items-start gap-2 rounded-lg border px-2.5 py-1.5">
                    <span
                      aria-hidden
                      className="bg-error mt-0.5 inline-block size-1.5 shrink-0 rounded-full"
                    />
                    <p className="text-on-surface text-[11px] leading-snug">
                      <span className="text-error font-semibold">
                        Cost cliff at {line.cliff.atScale}:
                      </span>{" "}
                      jumps to ${line.cliff.jumpsTo}/mo.{" "}
                      <span className="text-on-surface-variant">{line.cliff.reason}</span>
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Tiny conic-gradient donut for the variable/fixed split. */
function Donut({ pct }: { pct: number }): React.ReactElement {
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <div
      aria-hidden
      className="size-9 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(rgb(var(--md-sys-color-primary)) ${safe * 3.6}deg, rgb(var(--md-sys-color-outline-variant)) 0)`,
      }}
    >
      <div className="bg-surface m-1 size-7 rounded-full" />
    </div>
  );
}

/** Compound-growth sparkline. base is current month, growth is mo-on-mo factor. */
function Sparkline({ base, growthMoM }: { base: number; growthMoM: number }): React.ReactElement {
  const pts = Array.from({ length: 12 }, (_, i) => base * Math.pow(1 + growthMoM, i));
  const max = pts[pts.length - 1] ?? 1;
  const w = 120,
    h = 28;
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i / 11) * w} ${h - (v / max) * (h - 2) - 1}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-7 w-full" preserveAspectRatio="none">
      <path
        d={d}
        fill="none"
        stroke="rgb(var(--md-sys-color-primary))"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Knob({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit: string;
  hint: string;
}): React.ReactElement {
  return (
    <label className="border-outline-variant bg-surface flex flex-col gap-1.5 rounded-xl border px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
          {label}
        </span>
        <span className="text-on-surface text-sm font-semibold tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-outline-variant accent-primary h-1.5 w-full cursor-pointer appearance-none rounded-full"
      />
      <span className="text-on-surface-variant text-[10px]">{hint}</span>
    </label>
  );
}

/* ─── RisksLens ───────────────────────────────────────────────── */

function RisksLens({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): React.ReactElement {
  const { risks: RISKS } = useDecideData();
  // Build a 3×3 matrix
  const sevs: Severity[] = ["high", "med", "low"];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(360px,1fr)_1.1fr]">
      {/* MATRIX */}
      <div className="border-outline-variant flex min-h-0 flex-col border-b px-8 pb-6 pt-6 lg:border-b-0 lg:border-r">
        <div className="flex items-baseline justify-between pb-3">
          <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
            Risk matrix
          </span>
          <span className="text-on-surface-variant text-[10px] uppercase tracking-wider">
            likelihood × impact
          </span>
        </div>
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] grid-rows-[auto_1fr_1fr_1fr] gap-1.5">
          {/* column headers */}
          <span />
          {sevs.map((i) => (
            <span
              key={`ch-${i}`}
              className="text-on-surface-variant text-center text-[10px] font-semibold uppercase tracking-wider"
            >
              {i}
            </span>
          ))}
          {sevs.map((l) => (
            <Fragment key={`row-${l}`}>
              <span className="text-on-surface-variant self-center pr-2 text-right text-[10px] font-semibold uppercase tracking-wider">
                {l}
              </span>
              {sevs.map((i) => {
                const cell = RISKS.filter((r) => r.likelihood === l && r.impact === i);
                const heat = riskHeat(l, i);
                return (
                  <div
                    key={`cell-${l}-${i}`}
                    className="border-outline-variant min-h-[64px] rounded-xl border p-1.5"
                    style={{ backgroundColor: heat }}
                  >
                    <div className="flex flex-wrap gap-1">
                      {cell.map((r) => {
                        const active = selectedId === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => onSelect(active ? null : r.id)}
                            title={r.title}
                            className={`max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                              active
                                ? "border-primary bg-primary text-on-primary"
                                : "border-outline-variant bg-surface text-on-surface hover:border-primary"
                            }`}
                          >
                            {r.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        <p className="text-on-surface-variant mt-3 text-[11px]">
          Click a risk for full mitigation. Top-right cell (high × high) is empty — by design.
        </p>
      </div>

      {/* LIST view (sortable, scannable) */}
      <ul className="divide-outline-variant min-h-0 divide-y overflow-y-auto">
        {RISKS.map((r) => {
          const active = selectedId === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(active ? null : r.id)}
                className={`block w-full px-8 py-3 text-left transition-colors ${
                  active ? "bg-primary/8" : "hover:bg-on-surface/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                    {r.area}
                  </span>
                  <span className="flex items-center gap-1">
                    <SevPill s={r.likelihood} prefix="L" />
                    <SevPill s={r.impact} prefix="I" />
                  </span>
                </div>
                <p className="text-on-surface mt-1 text-sm font-semibold">{r.title}</p>
                <p className="text-on-surface-variant mt-1 text-xs leading-relaxed">{r.detail}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                  {r.effort ? (
                    <span className="border-outline-variant text-on-surface-variant rounded-full border px-1.5 py-0.5 font-medium">
                      ⏱ {r.effort} to mitigate
                    </span>
                  ) : null}
                  {r.owner ? (
                    <span className="bg-on-surface/[0.05] text-on-surface-variant rounded-full px-1.5 py-0.5 font-medium">
                      owner: {r.owner}
                    </span>
                  ) : null}
                </div>
                {r.precondition ? (
                  <p className="text-on-surface-variant/85 mt-1 text-[10px] italic leading-snug">
                    Only matters if: {r.precondition}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function riskHeat(l: Severity, i: Severity): string {
  const score = sevScore(l) * sevScore(i); // 1..9
  // Tint of primary at low intensity
  const opacity = 0.04 + score * 0.022; // ~0.06 to ~0.24
  return `rgb(var(--md-sys-color-primary) / ${opacity})`;
}
function sevScore(s: Severity): number {
  return s === "high" ? 3 : s === "med" ? 2 : 1;
}
function SevPill({ s, prefix }: { s: Severity; prefix: string }): React.ReactElement {
  const map = {
    high: "bg-primary/15 text-primary",
    med: "bg-on-surface/10 text-on-surface",
    low: "bg-on-surface/5 text-on-surface-variant",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${map[s]}`}
    >
      <span className="opacity-60">{prefix}</span>
      <span>{s}</span>
    </span>
  );
}

/* ─── DecisionsLens ───────────────────────────────────────────── */

function DecisionsLens({
  decisions,
  total,
  selectedId,
  onSelect,
}: {
  decisions: Decision[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-outline-variant flex items-baseline justify-between border-b px-8 pb-3 pt-6">
        <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
          Architecture decisions
        </span>
        <span className="text-on-surface-variant text-[10px] uppercase tabular-nums tracking-wider">
          {decisions.length} / {total}
        </span>
      </div>
      <ul className="divide-outline-variant min-h-0 flex-1 divide-y overflow-y-auto">
        {decisions.map((d) => {
          const active = selectedId === d.id;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(active ? null : d.id)}
                className={`grid w-full grid-cols-[1fr_auto] gap-3 px-8 py-4 text-left transition-colors ${
                  active ? "bg-primary/8" : "hover:bg-on-surface/5"
                }`}
              >
                <div className="min-w-0">
                  <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                    {d.topic}
                  </span>
                  <p className="text-on-surface mt-1 text-base font-semibold">
                    {d.pick} <CiteMark n={d.cite} />
                  </p>
                  {d.vs ? <p className="text-on-surface-variant mt-0.5 text-xs">{d.vs}</p> : null}
                  <p className="text-on-surface-variant mt-2 max-w-prose text-xs leading-relaxed">
                    {d.why}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {d.reversibility ? (
                      <span
                        title={
                          d.reversibility === "1-way"
                            ? "Hard to reverse — choose carefully"
                            : "Easy to reverse — bias to action"
                        }
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                          d.reversibility === "1-way"
                            ? "border-error/40 bg-error/[0.06] text-error"
                            : "border-outline-variant text-on-surface-variant"
                        }`}
                      >
                        <span aria-hidden>{d.reversibility === "1-way" ? "🔒" : "🔁"}</span>
                        {d.reversibility} door
                      </span>
                    ) : null}
                    {d.blastRadius ? (
                      <span className="border-outline-variant text-on-surface-variant rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                        blast: {d.blastRadius}
                      </span>
                    ) : null}
                    {d.revisitAt ? (
                      <span className="bg-on-surface/[0.05] text-on-surface-variant rounded-full px-1.5 py-0.5 text-[10px]">
                        revisit when: {d.revisitAt}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ConfPill conf={d.conf} />
              </button>
            </li>
          );
        })}
        {decisions.length === 0 ? (
          <li className="grid h-full place-items-center px-8 py-12">
            <p className="text-on-surface-variant text-sm">
              Decisions stream in here as agents complete.
            </p>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/* ─── SequenceLens ────────────────────────────────────────────── */

function SequenceLens(): React.ReactElement {
  const { latencyHops: LATENCY_HOPS, errorPath: ERROR_PATH } = useDecideData();
  const [path, setPath] = useState<"happy" | "error">("happy");
  // 6 lifelines · 8 messages — a real-feeling sequence diagram.
  const lifelines = [
    { id: "user", label: "Browser" },
    { id: "lb", label: "LB" },
    { id: "web", label: "tessar-web" },
    { id: "queue", label: "Service Bus" },
    { id: "worker", label: "orchestrator" },
    { id: "vertex", label: "Azure OpenAI" },
  ];
  const happyMessages: Array<{
    from: string;
    to: string;
    label: string;
    kind: "sync" | "async" | "external";
  }> = [
    { from: "user", to: "lb", label: "POST /runs", kind: "sync" },
    { from: "lb", to: "web", label: "TLS + WAF", kind: "sync" },
    { from: "web", to: "queue", label: "publish run", kind: "async" },
    { from: "queue", to: "worker", label: "managed-identity pull", kind: "async" },
    { from: "worker", to: "vertex", label: "LLM call ×N", kind: "external" },
    { from: "worker", to: "web", label: "stream events", kind: "async" },
    { from: "web", to: "user", label: "SSE events", kind: "async" },
    { from: "worker", to: "user", label: "package ready", kind: "async" },
  ];
  const messages = path === "happy" ? happyMessages : ERROR_PATH;
  const xOf = (id: string): number => {
    const i = lifelines.findIndex((l) => l.id === id);
    if (i < 0) return 8;
    return 8 + i * ((100 - 16) / (lifelines.length - 1));
  };
  const totalLatency = LATENCY_HOPS.reduce((s, h) => s + h.ms, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-outline-variant flex flex-wrap items-center justify-between gap-3 border-b px-8 pb-3 pt-6">
        <div>
          <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
            Request sequence
          </span>
          <p className="text-on-surface-variant mt-0.5 text-[11px]">
            {path === "happy"
              ? "one run, end to end"
              : "vendor failover — GPT-5 quota → Anthropic on Foundry"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Latency budget summary */}
          <div className="border-outline-variant hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] md:flex">
            <span className="text-on-surface-variant">budget</span>
            <span className="text-on-surface font-semibold tabular-nums">
              {(totalLatency / 1000).toFixed(1)} s
            </span>
            <span className="text-on-surface-variant">p95 end-to-end</span>
          </div>
          {/* Happy / error toggle */}
          <div
            role="tablist"
            className="border-outline-variant flex items-center gap-0 overflow-hidden rounded-full border text-[11px]"
          >
            {(["happy", "error"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={path === p}
                onClick={() => setPath(p)}
                className={`px-2.5 py-1 font-medium transition-colors ${
                  path === p
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-on-surface/5"
                }`}
              >
                {p === "happy" ? "Happy path" : "Error path"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Latency budget bar — segmented per hop */}
      {path === "happy" ? (
        <div className="border-outline-variant border-b px-8 py-3">
          <div className="border-outline-variant flex h-2 items-center overflow-hidden rounded-full border">
            {LATENCY_HOPS.map((h, i) => (
              <span
                key={h.node}
                title={`${h.node}: ${h.ms} ms — ${h.note}`}
                className="h-full"
                style={{
                  width: `${(h.ms / totalLatency) * 100}%`,
                  background:
                    i % 2 === 0
                      ? "rgb(var(--md-sys-color-primary) / 0.7)"
                      : "rgb(var(--md-sys-color-primary) / 0.35)",
                }}
              />
            ))}
          </div>
          <div className="text-on-surface-variant mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
            {LATENCY_HOPS.map((h) => (
              <span key={h.node}>
                <span className="text-on-surface font-semibold">{h.node}</span> {h.ms} ms
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {/* lifelines (vertical) */}
          {lifelines.map((l) => (
            <line
              key={l.id}
              x1={xOf(l.id)}
              x2={xOf(l.id)}
              y1={10}
              y2={94}
              stroke="rgb(var(--md-sys-color-outline-variant))"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* messages */}
          {messages.map((m, i) => {
            const y = 16 + i * ((92 - 16) / (messages.length - 1));
            const x1 = xOf(m.from);
            const x2 = xOf(m.to);
            const stroke =
              m.kind === "sync"
                ? "rgb(var(--md-sys-color-primary))"
                : "rgb(var(--md-sys-color-on-surface-variant))";
            const sw = m.kind === "sync" ? "1.4" : "1.1";
            return (
              <g key={`${m.from}-${m.to}-${i}`}>
                <line
                  x1={x1}
                  x2={x2}
                  y1={y}
                  y2={y}
                  stroke={stroke}
                  strokeWidth={sw}
                  vectorEffect="non-scaling-stroke"
                  markerEnd={m.kind === "sync" ? "url(#arrow-sync)" : "url(#arrow-async)"}
                />
              </g>
            );
          })}
          <defs>
            <marker
              id="arrow-sync"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--md-sys-color-primary))" />
            </marker>
            <marker
              id="arrow-async"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--md-sys-color-on-surface-variant))" />
            </marker>
          </defs>
        </svg>

        {/* lifeline headers */}
        {lifelines.map((l) => (
          <div
            key={`hdr-${l.id}`}
            className="pointer-events-none absolute -translate-x-1/2"
            style={{ left: `${xOf(l.id)}%`, top: "2%" }}
          >
            <div className="border-outline-variant bg-surface text-on-surface rounded-lg border px-2.5 py-1 text-[11px] font-semibold">
              {l.label}
            </div>
          </div>
        ))}

        {/* message labels */}
        {messages.map((m, i) => {
          const y = 16 + i * ((92 - 16) / (messages.length - 1));
          const xMid = (xOf(m.from) + xOf(m.to)) / 2;
          return (
            <div
              key={`lbl-${i}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${xMid}%`, top: `${y - 1.6}%` }}
            >
              <span className="border-outline-variant bg-surface text-on-surface-variant rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                {m.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── PackageLens ─────────────────────────────────────────────── */

function PackageLens(): React.ReactElement {
  const { auditMeta: AUDIT_META, packageGaps: PACKAGE_GAPS } = useDecideData();
  const meta = useDecideRun();
  const pages = [
    { n: 1, title: "Executive summary", lines: 6 },
    { n: 2, title: "Brief & assumptions", lines: 14 },
    { n: 3, title: "Architecture (C4)", lines: 10 },
    { n: 4, title: "Data flow", lines: 9 },
    { n: 5, title: "BOM & monthly cost", lines: 18 },
    { n: 6, title: "Risks & trade-offs", lines: 16 },
    { n: 7, title: "Sources & audit", lines: 12 },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-outline-variant flex items-baseline justify-between border-b px-8 pb-3 pt-6">
        <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
          Deliverable preview · PDF + Markdown
        </span>
        {(() => {
          const pdf =
            meta.pdfHref ?? (meta.runId ? `/api/runs/${meta.runId}/artifact/package_pdf` : null);
          const md =
            meta.mdHref ?? (meta.runId ? `/api/runs/${meta.runId}/artifact/package_md` : null);
          if (!pdf && !md) {
            return (
              <Button variant="filled" size="sm">
                Download package
              </Button>
            );
          }
          return (
            <div className="flex items-center gap-2">
              {md ? (
                <a
                  href={md}
                  target="_blank"
                  rel="noopener"
                  className="border-outline-variant text-on-surface hover:bg-on-surface/5 inline-flex h-7 items-center rounded-full border px-3 text-[11.5px] font-semibold"
                >
                  Markdown
                </a>
              ) : null}
              {pdf ? (
                <a
                  href={pdf}
                  target="_blank"
                  rel="noopener"
                  className="bg-primary text-on-primary inline-flex h-7 items-center rounded-full px-3 text-[11.5px] font-semibold shadow-[0_8px_22px_-8px_rgb(var(--md-sys-color-primary)/0.55)]"
                >
                  Download PDF
                </a>
              ) : null}
            </div>
          );
        })()}
      </div>
      {/* Audit strip — model versions, KB snapshot, prompt + token counts.
          Surfaces the trust requirement from product-goals (every run must
          ship its provenance) without breaking the design lock by adding
          a new lens. The Sources & audit page card below details each. */}
      <dl
        className="border-outline-variant bg-surface/60 grid grid-cols-2 gap-x-6 gap-y-1 border-b px-8 py-3 text-[10.5px] sm:grid-cols-3 lg:grid-cols-5"
        aria-label="Run audit metadata"
      >
        {AUDIT_META.map((m) => (
          <div key={m.label} className="flex items-baseline gap-1.5 truncate">
            <dt className="text-on-surface-variant font-semibold uppercase tracking-wider">
              {m.label}
            </dt>
            <dd className="text-on-surface truncate font-semibold tabular-nums">{m.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-8 py-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {pages.map((p) => (
          <article
            key={p.n}
            className="border-outline-variant bg-surface aspect-[1/1.4] overflow-hidden rounded-xl border p-4 shadow-[0_18px_50px_-30px_rgb(0_0_0/0.25)]"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-primary text-[10px] font-semibold uppercase tracking-[0.16em]">
                Page {p.n}
              </span>
              <span className="text-on-surface-variant text-[9px] uppercase tracking-wider">
                A4 · portrait
              </span>
            </div>
            <h3 className="text-on-surface mt-2 text-base font-semibold">{p.title}</h3>
            <div className="mt-3 space-y-1.5">
              {Array.from({ length: p.lines }).map((_, i) => (
                <span
                  key={i}
                  className="bg-outline-variant/50 block h-1.5 rounded-full"
                  style={{ width: `${60 + ((i * 13) % 35)}%` }}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
      {/* Honest gap list */}
      <section className="border-outline-variant bg-surface/60 border-t px-8 py-5">
        <div className="flex items-baseline justify-between pb-2">
          <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
            Not included in this package
          </span>
          <span className="text-on-surface-variant text-[10px] uppercase tracking-wider">
            be honest about scope
          </span>
        </div>
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {PACKAGE_GAPS.map((g) => (
            <li
              key={g.title}
              className="border-outline-variant bg-surface rounded-xl border px-3 py-2"
            >
              <p className="text-on-surface text-xs font-semibold">{g.title}</p>
              <p className="text-on-surface-variant mt-0.5 text-[11px] leading-snug">{g.detail}</p>
              {g.planned ? (
                <p className="text-primary/80 mt-1 text-[10px] font-medium uppercase tracking-wider">
                  {g.planned}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ─── AssumptionsLens ─────────────────────────────────────────── */

const ASSUMPTION_CAT_LABEL: Record<Assumption["category"], string> = {
  scale: "Scale",
  compliance: "Compliance",
  team: "Team",
  slo: "SLO",
  domain: "Domain",
};

function AssumptionsLens({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): React.ReactElement {
  const { assumptions: ASSUMPTIONS } = useDecideData();
  const grouped = useMemo(() => {
    const m = new Map<Assumption["category"], Assumption[]>();
    for (const a of ASSUMPTIONS) {
      const arr = m.get(a.category) ?? [];
      arr.push(a);
      m.set(a.category, arr);
    }
    return Array.from(m.entries());
  }, [ASSUMPTIONS]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-outline-variant flex items-baseline justify-between border-b px-8 pb-3 pt-6">
        <div>
          <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
            Assumptions · the run treated these as true
          </span>
          <p className="text-on-surface-variant/85 mt-1 max-w-2xl text-xs">
            Edit any assumption that doesn&apos;t match your world. Changes regenerate the affected
            sections of the package — the rest is preserved.
          </p>
        </div>
        <Button variant="filled" size="sm" disabled>
          Re-run with changes
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 py-6">
        {grouped.map(([cat, items]) => (
          <section key={cat}>
            <h3 className="text-primary mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
              {ASSUMPTION_CAT_LABEL[cat]}
            </h3>
            <ul className="divide-outline-variant border-outline-variant bg-surface divide-y overflow-hidden rounded-xl border">
              {items.map((a) => {
                const active = selectedId === a.id;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(active ? null : a.id)}
                      className={`group flex w-full items-start gap-4 px-4 py-3 text-left transition-colors ${
                        active ? "bg-primary/5" : "hover:bg-on-surface/[0.03]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-on-surface text-sm">{a.text}</p>
                        <p className="text-on-surface-variant mt-1 text-xs">
                          <span className="text-on-surface-variant/90 font-medium">Impact:</span>{" "}
                          {a.impact}
                        </p>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        {a.editable ? (
                          <span className="border-outline-variant text-on-surface-variant rounded-full border px-2 py-0.5 text-[10px] font-medium">
                            editable
                          </span>
                        ) : (
                          <span className="border-outline-variant bg-on-surface/[0.04] text-on-surface-variant/70 rounded-full border px-2 py-0.5 text-[10px] font-medium">
                            locked · scope
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ─── RoadmapLens ─────────────────────────────────────────────── */

const ROADMAP_PHASES: RoadmapItem["phase"][] = ["Day 1", "Week 1", "Month 1", "Quarter 1"];

function RoadmapLens({
  selectedId,
  onSelect,
  onJumpToDecision,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onJumpToDecision: (id: string) => void;
}): React.ReactElement {
  const { roadmap: ROADMAP } = useDecideData();
  const totalEffort = ROADMAP.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-outline-variant flex items-baseline justify-between border-b px-8 pb-3 pt-6">
        <div>
          <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
            Roadmap · build order from this design
          </span>
          <p className="text-on-surface-variant/85 mt-1 max-w-2xl text-xs">
            {totalEffort} steps across 4 phases. Items marked with a decision link back to the
            trade-off that locked the choice.
          </p>
        </div>
        <Button variant="outlined" size="sm">
          Export as Markdown
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-8 py-6 md:grid-cols-2 xl:grid-cols-4">
        {ROADMAP_PHASES.map((phase) => {
          const items = ROADMAP.filter((r) => r.phase === phase);
          return (
            <section
              key={phase}
              className="border-outline-variant bg-surface flex min-h-0 flex-col rounded-xl border"
            >
              <header className="border-outline-variant flex items-baseline justify-between border-b px-3 py-2">
                <h3 className="text-primary text-[11px] font-semibold uppercase tracking-[0.16em]">
                  {phase}
                </h3>
                <span className="text-on-surface-variant text-[10px] tabular-nums">
                  {items.length}
                </span>
              </header>
              <ul className="flex flex-1 flex-col gap-2 p-2">
                {items.map((r) => {
                  const active = selectedId === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(active ? null : r.id)}
                        className={`flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-primary/50 bg-primary/5"
                            : "border-outline-variant hover:border-outline hover:bg-on-surface/[0.03]"
                        }`}
                      >
                        <p className="text-on-surface text-xs font-medium leading-snug">
                          {r.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="border-outline-variant text-on-surface-variant rounded-full border px-1.5 py-0.5">
                            {r.effort}
                          </span>
                          <span className="bg-on-surface/[0.05] text-on-surface-variant rounded-full px-1.5 py-0.5">
                            {r.owner}
                          </span>
                          {r.decisionId ? (
                            <span
                              role="link"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                onJumpToDecision(r.decisionId!);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  onJumpToDecision(r.decisionId!);
                                }
                              }}
                              className="border-primary/40 text-primary hover:bg-primary/10 cursor-pointer rounded-full border px-1.5 py-0.5 font-medium"
                            >
                              ↗ decision
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Inspector ───────────────────────────────────────────────── */

function Inspector({
  selection,
  onClear,
  selectedNode,
  selectedDecision,
  selectedBom,
  selectedRisk,
  decisions,
  decisionsTotal,
  sources,
  onSelectDecision,
  onSelectSource,
  overrides,
  effectiveOverrides,
  onSetOverride,
}: {
  selection: Selection;
  onClear: () => void;
  selectedNode: ArchNode | null;
  selectedDecision: Decision | null;
  selectedBom: { line: BomLine; cost: number } | null;
  selectedRisk: Risk | null;
  decisions: Decision[];
  decisionsTotal: number;
  sources: typeof SOURCES;
  onSelectDecision: (id: string) => void;
  onSelectSource: (n: number) => void;
  overrides: Record<string, string>;
  effectiveOverrides: Record<string, string>;
  onSetOverride: (nodeId: string, optionId: string | null) => void;
}): React.ReactElement {
  const hasSelection = selection !== null;
  return (
    <aside className="border-outline-variant bg-surface/60 flex min-h-0 flex-col border-l backdrop-blur-sm">
      <div className="flex items-baseline justify-between px-5 pb-3 pt-4">
        <span className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
          {hasSelection ? "Inspector" : "Overview"}
        </span>
        {hasSelection ? (
          <button
            type="button"
            onClick={onClear}
            className="text-on-surface-variant hover:bg-on-surface/5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          >
            Clear ✕
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {!hasSelection ? (
          <OverviewInspector
            decisions={decisions}
            decisionsTotal={decisionsTotal}
            sources={sources}
            onSelectDecision={onSelectDecision}
            onSelectSource={onSelectSource}
          />
        ) : null}
        {selectedNode ? (
          <NodeInspector
            node={selectedNode}
            currentOptionId={effectiveOverrides[selectedNode.id] ?? null}
            isUserOverride={selectedNode.id in overrides}
            onSetOverride={onSetOverride}
          />
        ) : null}
        {selectedDecision ? <DecisionInspector d={selectedDecision} /> : null}
        {selectedBom ? <BomInspector item={selectedBom} /> : null}
        {selectedRisk ? <RiskInspector r={selectedRisk} /> : null}
        {selection?.kind === "source" ? <SourceInspector n={selection.n} /> : null}
        {selection?.kind === "assumption" ? <AssumptionInspector id={selection.id} /> : null}
        {selection?.kind === "roadmap" ? <RoadmapInspector id={selection.id} /> : null}
      </div>
    </aside>
  );
}

/* TweaksPanel removed — org constraints live in the brief rail; per-component
 * swaps live in a popover anchored to the diagram cards. */

function OverviewInspector({
  decisions,
  decisionsTotal,
  sources,
  onSelectDecision,
  onSelectSource,
}: {
  decisions: Decision[];
  decisionsTotal: number;
  sources: typeof SOURCES;
  onSelectDecision: (id: string) => void;
  onSelectSource: (n: number) => void;
}): React.ReactElement {
  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-baseline justify-between pb-2">
          <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            Decisions
          </span>
          <span className="text-on-surface-variant text-[10px] tabular-nums">
            {decisions.length}/{decisionsTotal}
          </span>
        </div>
        <ul className="divide-outline-variant border-outline-variant divide-y rounded-xl border">
          {decisions.length === 0 ? (
            <li className="text-on-surface-variant px-3 py-4 text-center text-xs">
              Decisions stream in as agents complete.
            </li>
          ) : (
            decisions.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSelectDecision(d.id)}
                  className="hover:bg-on-surface/5 grid w-full grid-cols-[1fr_auto] gap-2 px-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                      {d.topic}
                    </span>
                    <p className="text-on-surface truncate text-xs font-semibold">{d.pick}</p>
                  </div>
                  <ConfPill conf={d.conf} />
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <div className="flex items-baseline justify-between pb-2">
          <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            Sources
          </span>
          <span className="text-on-surface-variant text-[10px] tabular-nums">{sources.length}</span>
        </div>
        <ul className="divide-outline-variant border-outline-variant divide-y rounded-xl border">
          {sources.map((s) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => onSelectSource(s.n)}
                className="hover:bg-on-surface/5 flex w-full items-start gap-2 px-3 py-2 text-left"
              >
                <span className="bg-primary text-on-primary mt-0.5 grid size-4 flex-shrink-0 place-items-center rounded-full text-[9px] font-semibold tabular-nums">
                  {s.n}
                </span>
                <div className="min-w-0">
                  <p className="text-on-surface truncate text-xs">{s.text}</p>
                  <p className="text-on-surface-variant text-[10px] uppercase tracking-wider">
                    {s.kind}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-on-surface-variant text-[10px]">
        Tip: click any node, BOM row, risk, or source for full detail.
      </p>
    </div>
  );
}

function InspectorHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}): React.ReactElement {
  return (
    <header className="border-outline-variant border-b pb-3">
      <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.16em]">
        {eyebrow}
      </p>
      <h3 className="text-on-surface mt-1 text-base font-semibold">{title}</h3>
      {sub ? <p className="text-on-surface-variant text-[11px]">{sub}</p> : null}
    </header>
  );
}

function NodeInspector({
  node,
  currentOptionId,
  isUserOverride,
  onSetOverride,
}: {
  node: ArchNode;
  currentOptionId: string | null;
  isUserOverride: boolean;
  onSetOverride: (nodeId: string, optionId: string | null) => void;
}): React.ReactElement {
  const { nodes: NODES, componentOptions: COMPONENT_OPTIONS } = useDecideData();
  const options = COMPONENT_OPTIONS[node.id] ?? null;
  const activeOption = options
    ? (options.find((o) => o.id === (currentOptionId ?? options[0]!.id)) ?? options[0]!)
    : null;
  return (
    <div className="space-y-4">
      <InspectorHeader
        eyebrow={node.zone === "external" ? "External service" : "Component"}
        title={node.label}
        sub={node.sub}
      />
      {options && activeOption ? (
        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
            isUserOverride
              ? "border-primary/40 bg-primary/[0.05]"
              : "border-outline-variant bg-surface-container-lowest/50"
          }`}
        >
          <span aria-hidden className="mt-0.5 text-[12px]">
            ↹
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-on-surface-variant text-[10.5px] font-semibold uppercase tracking-wider">
              {isUserOverride ? "Overridden variant" : "Recommended variant"}
            </p>
            <p className="text-on-surface mt-0.5 text-[12.5px] font-semibold">
              {activeOption.label}
            </p>
            <p className="text-on-surface-variant text-[10.5px] leading-snug">
              {activeOption.note}
            </p>
            <p className="text-on-surface-variant mt-1 text-[10px]">
              Click the <span aria-hidden>↹</span> on the diagram card to swap.
              {isUserOverride ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => onSetOverride(node.id, null)}
                    className="text-primary font-semibold hover:underline"
                  >
                    ↺ Reset
                  </button>
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}
      {node.dataClass ? (
        <Section title="Data classification">
          <p className="text-on-surface flex items-center gap-2 text-xs">
            <DataClassDot c={node.dataClass} />
            {DATA_CLASS_LABEL[node.dataClass]}
          </p>
        </Section>
      ) : null}
      {node.failureDomain && node.failureDomain.length > 0 ? (
        <Section title="Blast radius if this fails">
          <p className="text-on-surface-variant text-[11px]">Also down or degraded:</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {node.failureDomain.map((id) => {
              const n = NODES.find((x) => x.id === id);
              return (
                <li
                  key={id}
                  className="border-error/40 bg-error/[0.05] text-error rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                >
                  {n ? n.label : id}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
      {node.why ? (
        <Section title="Why this">
          <p className="text-on-surface text-xs leading-relaxed">{node.why}</p>
          {node.alts ? (
            <p className="text-on-surface-variant mt-2 text-[11px]">
              Considered: <span className="text-on-surface">{node.alts}</span>
            </p>
          ) : null}
        </Section>
      ) : null}
      {node.scale ? (
        <Section title="Scaling">
          <ul className="space-y-1.5">
            {node.scale.map((s) => (
              <li
                key={s.tier}
                className="border-outline-variant flex items-start gap-2 rounded-lg border px-2.5 py-1.5"
              >
                <span className="bg-primary/10 text-primary mt-px inline-flex h-4 min-w-[28px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums">
                  {s.tier}
                </span>
                <p className="text-on-surface text-[11px] leading-snug">{s.note}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <p className="text-on-surface-variant text-[10px]">
        Source <CiteMark n={node.cite} /> · click another node to compare
      </p>
    </div>
  );
}

function DecisionInspector({ d }: { d: Decision }): React.ReactElement {
  return (
    <div className="space-y-4">
      <InspectorHeader eyebrow={d.topic} title={d.pick} sub={d.vs} />
      <Section title="Why this">
        <p className="text-on-surface text-xs leading-relaxed">{d.why}</p>
      </Section>
      <Section title="Confidence">
        <ConfPill conf={d.conf} />
      </Section>
      {d.reversibility || d.blastRadius || d.revisitAt ? (
        <Section title="Reversibility">
          <ul className="space-y-1.5">
            {d.reversibility ? (
              <li className="flex items-baseline gap-2 text-xs">
                <span className="text-on-surface-variant w-20 shrink-0 text-[10px] uppercase tracking-wider">
                  Door
                </span>
                <span className="text-on-surface font-semibold">
                  {d.reversibility === "1-way"
                    ? "\uD83D\uDD12 1-way — hard to reverse"
                    : "\uD83D\uDD01 2-way — easy to reverse"}
                </span>
              </li>
            ) : null}
            {d.blastRadius ? (
              <li className="flex items-baseline gap-2 text-xs">
                <span className="text-on-surface-variant w-20 shrink-0 text-[10px] uppercase tracking-wider">
                  Blast
                </span>
                <span className="text-on-surface">{d.blastRadius}</span>
              </li>
            ) : null}
            {d.revisitAt ? (
              <li className="flex items-baseline gap-2 text-xs">
                <span className="text-on-surface-variant w-20 shrink-0 text-[10px] uppercase tracking-wider">
                  Revisit
                </span>
                <span className="text-on-surface-variant">{d.revisitAt}</span>
              </li>
            ) : null}
          </ul>
        </Section>
      ) : null}
      <p className="text-on-surface-variant text-[10px]">
        Source <CiteMark n={d.cite} />
      </p>
    </div>
  );
}

function BomInspector({ item }: { item: { line: BomLine; cost: number } }): React.ReactElement {
  const { line, cost } = item;
  const breakdown: Array<{ label: string; v: number }> = [
    { label: "Base", v: line.base },
    { label: "per Users ×", v: line.per.users },
    { label: "per RPS ×", v: line.per.rps },
    { label: "per GB ×", v: line.per.gb },
  ];
  return (
    <div className="space-y-4">
      <InspectorHeader
        eyebrow={line.service}
        title={line.sku}
        sub={`$${cost.toFixed(2)} / month at current scale`}
      />
      <Section title="Cost model">
        <ul className="grid grid-cols-2 gap-1.5">
          {breakdown.map((b) => (
            <li key={b.label} className="border-outline-variant rounded-lg border px-2 py-1.5">
              <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                {b.label}
              </p>
              <p className="text-on-surface text-xs font-semibold tabular-nums">
                ${b.v.toFixed(2)}
              </p>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Why this">
        <p className="text-on-surface text-xs leading-relaxed">{line.why}</p>
        {line.alts ? (
          <p className="text-on-surface-variant mt-2 text-[11px]">
            Considered: <span className="text-on-surface">{line.alts}</span>
          </p>
        ) : null}
      </Section>
      {typeof line.freeTierPct === "number" && line.freeTierPct > 0 ? (
        <Section title="Free-tier coverage">
          <div className="bg-outline-variant/50 h-1.5 overflow-hidden rounded-full">
            <span
              className="bg-primary/70 block h-full rounded-full"
              style={{ width: `${line.freeTierPct}%` }}
            />
          </div>
          <p className="text-on-surface-variant mt-1 text-[10px]">
            {line.freeTierPct}% covered at current scale.
          </p>
        </Section>
      ) : null}
      {line.cliff ? (
        <Section title="Cost cliff">
          <div className="border-error/40 bg-error/[0.05] rounded-lg border px-2.5 py-2">
            <p className="text-error text-[11px] font-semibold">
              At {line.cliff.atScale}: jumps to ${line.cliff.jumpsTo}/mo
            </p>
            <p className="text-on-surface-variant mt-0.5 text-[11px]">{line.cliff.reason}</p>
          </div>
        </Section>
      ) : null}
      <p className="text-on-surface-variant text-[10px]">
        Source <CiteMark n={line.cite} />
      </p>
    </div>
  );
}

function RiskInspector({ r }: { r: Risk }): React.ReactElement {
  return (
    <div className="space-y-4">
      <InspectorHeader eyebrow={r.area} title={r.title} />
      <Section title="Severity">
        <div className="flex gap-2">
          <SevPill s={r.likelihood} prefix="Likelihood" />
          <SevPill s={r.impact} prefix="Impact" />
        </div>
      </Section>
      <Section title="Detail">
        <p className="text-on-surface text-xs leading-relaxed">{r.detail}</p>
      </Section>
      <Section title="Mitigation">
        <p className="text-on-surface text-xs leading-relaxed">{r.mitigation}</p>
      </Section>
      {r.effort || r.owner || r.precondition ? (
        <Section title="Operational">
          <ul className="space-y-1">
            {r.effort ? (
              <li className="flex items-baseline gap-2 text-xs">
                <span className="text-on-surface-variant w-20 shrink-0 text-[10px] uppercase tracking-wider">
                  Effort
                </span>
                <span className="text-on-surface">{r.effort} to mitigate</span>
              </li>
            ) : null}
            {r.owner ? (
              <li className="flex items-baseline gap-2 text-xs">
                <span className="text-on-surface-variant w-20 shrink-0 text-[10px] uppercase tracking-wider">
                  Owner
                </span>
                <span className="text-on-surface">{r.owner}</span>
              </li>
            ) : null}
            {r.precondition ? (
              <li className="flex items-baseline gap-2 text-xs">
                <span className="text-on-surface-variant w-20 shrink-0 text-[10px] uppercase tracking-wider">
                  When
                </span>
                <span className="text-on-surface-variant">{r.precondition}</span>
              </li>
            ) : null}
          </ul>
        </Section>
      ) : null}
      {r.cite ? (
        <p className="text-on-surface-variant text-[10px]">
          Source <CiteMark n={r.cite} />
        </p>
      ) : null}
    </div>
  );
}

function SourceInspector({ n }: { n: number }): React.ReactElement {
  const { sources: SOURCES } = useDecideData();
  const s = SOURCES.find((x) => x.n === n);
  if (!s) return <p className="text-on-surface-variant text-xs">Source not found.</p>;
  return (
    <div className="space-y-4">
      <InspectorHeader eyebrow={s.kind === "KB" ? "Knowledge base" : "Web source"} title={s.text} />
      <Section title="Citation">
        <p className="text-on-surface text-xs">
          Cited <CiteMark n={s.n} /> across decisions and BOM lines.
        </p>
      </Section>
    </div>
  );
}

function AssumptionInspector({ id }: { id: string }): React.ReactElement {
  const { assumptions: ASSUMPTIONS } = useDecideData();
  const a = ASSUMPTIONS.find((x) => x.id === id);
  if (!a) return <p className="text-on-surface-variant text-xs">Assumption not found.</p>;
  return (
    <div className="space-y-4">
      <InspectorHeader
        eyebrow={`Assumption · ${ASSUMPTION_CAT_LABEL[a.category]}`}
        title={a.text}
      />
      <Section title="Why this matters">
        <p className="text-on-surface-variant text-xs">{a.impact}</p>
      </Section>
      <Section title="Status">
        <p className="text-on-surface-variant text-xs">
          {a.editable
            ? "Editable. Changing this triggers a partial re-run of affected sections."
            : "Locked. This is a scope assumption baked into the MVP product surface."}
        </p>
      </Section>
    </div>
  );
}

function RoadmapInspector({ id }: { id: string }): React.ReactElement {
  const { roadmap: ROADMAP, decisions: DECISIONS } = useDecideData();
  const r = ROADMAP.find((x) => x.id === id);
  if (!r) return <p className="text-on-surface-variant text-xs">Step not found.</p>;
  const linkedDecision = r.decisionId ? DECISIONS.find((d) => d.id === r.decisionId) : null;
  return (
    <div className="space-y-4">
      <InspectorHeader
        eyebrow={`Roadmap · ${r.phase}`}
        title={r.title}
        sub={`${r.effort} · ${r.owner}`}
      />
      {linkedDecision ? (
        <Section title="Linked decision">
          <p className="text-on-surface text-xs">{linkedDecision.pick}</p>
          <p className="text-on-surface-variant mt-1 text-xs">{linkedDecision.why}</p>
        </Section>
      ) : null}
      <Section title="Order rationale">
        <p className="text-on-surface-variant text-xs">
          Sequenced by dependency. Earlier phases unblock later ones; missing an earlier step delays
          everything downstream.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section>
      <p className="text-on-surface-variant pb-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
        {title}
      </p>
      {children}
    </section>
  );
}

/* ─── Lens prompts ────────────────────────────────────────────── */

/** Per-lens one-line orientation prompt. Surfaced as the tooltip on
 *  each header tab and inside the first-run TourTooltip. */
const LENS_PROMPT: Record<Lens, string> = {
  architecture: "Skim the topology. Click any component to see why it's there.",
  cost: "Drag the scale knobs. Watch the BOM and per-run margin react.",
  decisions: "5 trade-offs were made. Each has a 1-way / 2-way door + a revisit trigger.",
  risks: "Top-right cell is empty by design. Click any tile for mitigation + owner.",
  sequence: "One run, end to end. Toggle to the error path to see vendor failover.",
  package: 'Preview the deliverable. Note the honest "not included" gap list.',
  assumptions: "If any of these don't match your world, edit and re-run the affected sections.",
  roadmap:
    "Build order across Day 1 → Quarter 1. Items link back to the decision that locked them.",
};

/* ─── TourTooltip ─────────────────────────────────────────────── */

function TourTooltip({
  lens,
  onDismiss,
}: {
  lens: Lens;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <motion.div
      key={lens}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.4, ...expressiveDefault }}
      className="border-outline-variant bg-surface pointer-events-auto absolute left-[calc(50%-180px)] top-[110px] z-30 max-w-sm rounded-2xl border px-4 py-3 shadow-[0_18px_60px_-30px_rgb(0_0_0/0.45)] backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.16em]">
            First time here?
          </p>
          <p className="text-on-surface mt-1 text-xs leading-snug">{LENS_PROMPT[lens]}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-on-surface-variant hover:bg-on-surface/5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        >
          Got it ✕
        </button>
      </div>
    </motion.div>
  );
}

/* ─── StoryView ───────────────────────────────────────────────── */

/** Story mode: a narrative scroll through the same data. Each section
 *  jumps back into the corresponding lens for the depth view. */
function StoryView({
  brief,
  totals,
  decisions,
  done,
  onJumpLens,
}: {
  brief: string;
  totals: { lines: { line: BomLine; cost: number }[]; total: number };
  decisions: Decision[];
  done: boolean;
  onJumpLens: (l: Lens) => void;
}): React.ReactElement {
  const {
    nodes: NODES,
    decisions: DECISIONS,
    bom: BOM_LINES,
    risks: RISKS,
    assumptions: ASSUMPTIONS,
    roadmap: ROADMAP,
    packageGaps: PACKAGE_GAPS,
  } = useDecideData();
  const topDecisions = decisions.slice(0, 3);
  const topRisks = RISKS.slice(0, 3);
  return (
    <main className="relative z-10 overflow-y-auto" style={{ height: "calc(100dvh - 49px)" }}>
      <div className="mx-auto max-w-3xl px-8 py-12">
        <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
          The story · narrative read of the package
        </p>
        <h1 className="text-on-surface mt-2 text-3xl font-semibold leading-tight">
          What we built for your brief
        </h1>
        <p className="text-on-surface-variant mt-3 text-sm leading-relaxed">{brief}</p>

        <Story.Hr />
        <Story.H2 onJump={() => onJumpLens("assumptions")} lens="assumptions">
          1 · The assumptions
        </Story.H2>
        <p className="text-on-surface mt-2 text-sm leading-relaxed">
          We treated {ASSUMPTIONS.length} things as true. The most consequential:{" "}
          <span className="font-medium">{ASSUMPTIONS[0]?.text.toLowerCase()}</span> and{" "}
          <span className="font-medium">{ASSUMPTIONS[1]?.text.toLowerCase()}</span>. If either
          doesn&apos;t match, the architecture and cost shift materially.
        </p>

        <Story.Hr />
        <Story.H2 onJump={() => onJumpLens("architecture")} lens="architecture">
          2 · The shape
        </Story.H2>
        <p className="text-on-surface mt-2 text-sm leading-relaxed">
          {NODES.length} components in 3 zones. Two services do the work — a thin web tier and a
          long-running orchestrator — separated by a managed-identity-authed Service Bus push so the
          worker can scale to zero between runs.
        </p>
        <ul className="text-on-surface-variant mt-3 space-y-1.5 text-xs">
          {NODES.filter((n) => n.zone === "app" || n.zone === "data")
            .slice(0, 6)
            .map((n) => (
              <li key={n.id} className="flex items-baseline gap-2">
                <span className="bg-primary size-1 rounded-full" aria-hidden />
                <span>
                  <span className="text-on-surface font-semibold">{n.label}</span> — {n.sub}
                </span>
              </li>
            ))}
        </ul>

        <Story.Hr />
        <Story.H2 onJump={() => onJumpLens("decisions")} lens="decisions">
          3 · The trade-offs
        </Story.H2>
        <p className="text-on-surface mt-2 text-sm leading-relaxed">
          {DECISIONS.length} decisions were made. Top three:
        </p>
        <ol className="mt-3 space-y-2">
          {topDecisions.map((d, i) => (
            <li
              key={d.id}
              className="border-outline-variant bg-surface rounded-xl border px-4 py-3"
            >
              <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                {i + 1}. {d.topic}
              </p>
              <p className="text-on-surface mt-0.5 text-sm font-semibold">{d.pick}</p>
              <p className="text-on-surface-variant mt-1 text-xs">{d.why}</p>
              {d.reversibility ? (
                <p className="text-on-surface-variant mt-1.5 text-[10px] font-medium uppercase tracking-wider">
                  {d.reversibility === "1-way" ? "🔒 1-way door" : "🔁 2-way door"} · blast:{" "}
                  {d.blastRadius ?? "—"}
                </p>
              ) : null}
            </li>
          ))}
        </ol>

        <Story.Hr />
        <Story.H2 onJump={() => onJumpLens("cost")} lens="cost">
          4 · What it costs
        </Story.H2>
        <p className="text-on-surface mt-2 text-sm leading-relaxed">
          About{" "}
          <span className="text-on-surface font-semibold">${totals.total.toFixed(0)} / month</span>{" "}
          at launch scale. Two cost cliffs to know:{" "}
          {BOM_LINES.filter((l) => l.cliff)
            .slice(0, 2)
            .map((l, i, arr) => (
              <Fragment key={l.id}>
                <span className="font-medium">{l.service}</span> jumps to ${l.cliff!.jumpsTo} at{" "}
                {l.cliff!.atScale}
                {i < arr.length - 1 ? "; " : "."}
              </Fragment>
            ))}
        </p>

        <Story.Hr />
        <Story.H2 onJump={() => onJumpLens("risks")} lens="risks">
          5 · What could go wrong
        </Story.H2>
        <ul className="mt-2 space-y-2">
          {topRisks.map((r) => (
            <li
              key={r.id}
              className="border-outline-variant bg-surface rounded-xl border px-4 py-3"
            >
              <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                {r.area}
              </p>
              <p className="text-on-surface mt-0.5 text-sm font-semibold">{r.title}</p>
              <p className="text-on-surface-variant mt-1 text-xs">{r.mitigation}</p>
            </li>
          ))}
        </ul>

        <Story.Hr />
        <Story.H2 onJump={() => onJumpLens("roadmap")} lens="roadmap">
          6 · How to build it
        </Story.H2>
        <p className="text-on-surface mt-2 text-sm leading-relaxed">
          {ROADMAP.length} steps across 4 phases. Day 1 is plumbing (
          {ROADMAP.filter((r) => r.phase === "Day 1").length} items), Week 1 is the vertical slice,
          Month 1 hardens for production, Quarter 1 unlocks trust + scale.
        </p>

        <Story.Hr />
        <Story.H2 onJump={() => onJumpLens("package")} lens="package">
          7 · The deliverable
        </Story.H2>
        <p className="text-on-surface mt-2 text-sm leading-relaxed">
          You get a 7-page PDF + Markdown bundle. We&apos;re explicit about what&apos;s
          <span className="italic"> not</span> in it ({PACKAGE_GAPS.length} gap items) so there are
          no surprises.
        </p>
        {done ? (
          <div className="mt-6 flex justify-end">
            <Button variant="filled" size="sm">
              Download package
            </Button>
          </div>
        ) : null}

        <p className="text-on-surface-variant mt-12 text-center text-[10px] uppercase tracking-[0.18em]">
          End of story · use the Lens view above for depth
        </p>
      </div>
    </main>
  );
}

const Story = {
  Hr: (): React.ReactElement => <hr className="border-outline-variant my-10 border-t" />,
  H2: ({
    children,
    onJump,
    lens,
  }: {
    children: React.ReactNode;
    onJump: () => void;
    lens: Lens;
  }): React.ReactElement => (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-on-surface text-xl font-semibold">{children}</h2>
      <button
        type="button"
        onClick={onJump}
        className="border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium"
        title={`Open the ${lens} lens for full detail`}
      >
        open lens →
      </button>
    </div>
  ),
};

/* --- Public exports ---------------------------------------------
 * The original /decide page is now a reusable studio that takes
 * its data via props. The default data exported here is the canned
 * demo dataset that the marketing /decide route renders verbatim;
 * /decide/[id] supplies a DecideData mapped from a real RunPackage.
 * ----------------------------------------------------------------- */

export const DEFAULT_DECIDE_DATA: DecideData = {
  nodes: NODES,
  edges: EDGES,
  decisions: DECISIONS,
  bom: BOM_LINES,
  risks: RISKS,
  assumptions: ASSUMPTIONS,
  roadmap: ROADMAP,
  sources: SOURCES,
  componentOptions: COMPONENT_OPTIONS,
  orgConstraints: ORG_CONSTRAINTS,
  latencyHops: LATENCY_HOPS,
  errorPath: ERROR_PATH,
  packageGaps: PACKAGE_GAPS,
  auditMeta: AUDIT_META,
  brief: SAMPLE_BRIEF,
};

export function DecideStudio({
  data = DEFAULT_DECIDE_DATA,
  meta = {},
}: {
  data?: DecideData;
  meta?: DecideRunMeta;
} = {}): React.ReactElement {
  return (
    <DecideDataContext.Provider value={data}>
      <DecideRunContext.Provider value={meta}>
        <DecideStudioBody />
      </DecideRunContext.Provider>
    </DecideDataContext.Provider>
  );
}
