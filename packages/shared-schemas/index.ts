/**
 * @tessar/shared-schemas
 *
 * Single source of truth for TESSAR's run-output contract.
 *
 * Consumed by:
 *   - apps/web         → renders the /decide result view
 *   - apps/orchestrator → Pydantic mirror at apps/orchestrator/tessar/schemas/
 *                        (kept in lockstep manually until JSON-Schema codegen
 *                        lands in Phase 2).
 *
 * Locked by ADR-0004 (docs/adr/0004-design-lock-agent-output-contract.md).
 *
 * Conventions:
 *   - All `id` fields are stable, machine-friendly slugs ([a-z0-9-]+).
 *   - All `cite` numeric IDs index into `RunPackage.sources[]`.
 *   - Cost fields are USD/month at the brief's stated baseline scale unless
 *     the field name explicitly says otherwise.
 *   - "Default option" of a `ComponentOption[]` is index 0; UI semantics
 *     treat it as the synthesizer's chosen pick.
 */

// ─── Architecture: nodes & edges ────────────────────────────────

export type Zone = "client" | "edge" | "app" | "data" | "external";

export type DataClass = "public" | "internal" | "confidential" | "regulated";

/** Forward-compatible icon token; UI falls back to a generic glyph. */
export type IconName = string;

/** One scale-tier note. The architect emits exactly three per node, in
 *  order: 1×, 10×, 100×. Tiers are descriptive, not numeric thresholds —
 *  they communicate "what changes as you grow". */
export interface ScaleTier {
  tier: "1×" | "10×" | "100×";
  note: string;
}

/** A single architecture component as emitted by the `architect` agent. */
export interface ArchNode {
  id: string;
  label: string;
  /** One-line role (e.g. "Next.js 15 · Container Apps"). */
  sub: string;
  zone: Zone;
  icon: IconName;
  /** Citation index into RunPackage.sources[]. */
  cite: number;

  /** Sensitivity classification for the data this node sees. */
  dataClass: DataClass;
  /** IDs of nodes whose failure cascades from this node. */
  failureDomain: string[];

  /** One-paragraph justification grounded in a KB record or web source. */
  why: string;
  /** Exactly three tiers (1×, 10×, 100×). Validated by Pydantic on emit. */
  scale: [ScaleTier, ScaleTier, ScaleTier];
  /** Short comma-separated string of considered alternatives. */
  alts: string;
  /** Optional one-line capacity headline (e.g. "10k RPS"). */
  scaleChip?: string;

  /** Phase id when this node first appears. Drives the build-up
   *  animation in the UI. Free-form; orchestrator owns the phase list. */
  appearsAt?: string;

  /** Diagram coordinates (% in a 100×100 viewBox) and width-% for the
   *  card. The architect proposes; UI may auto-relayout in future. */
  x: number;
  y: number;
  w: number;
}

export type EdgeKind = "sync" | "async" | "data" | "external";

/** A single architecture edge as emitted by the `architect` agent. */
export interface ArchEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Optional short verb on the wire ("publish run", "subscribe"). */
  label?: string;
  /** Optional curve hint in viewBox units; UI may ignore. */
  curve?: number;
  /** Phase id when this edge first becomes live. */
  appearsAt?: string;

  // Operational metadata — all optional, all displayed once `done`.
  qps?: string;
  p95?: string;
  retry?: string;
  payload?: string;
}

// ─── Synthesizer: swappable component options ───────────────────

/** One alternative for a swappable architecture slot. Default option is
 *  always index 0. `costMul` is a multiplier vs the default's monthly
 *  cost (1.0 = same). Client-side only at MVP — the displayed delta is
 *  a heuristic, not a re-grounded estimate. */
export interface ComponentOption {
  id: string;
  label: string;
  sub: string;
  /** ≤ 2 sentences explaining when to pick this over the default. */
  note: string;
  costMul: number;
  /** True if picking this option means removing the slot entirely. */
  remove?: boolean;
}

// ─── Decisions ──────────────────────────────────────────────────

export type Confidence = "low" | "med" | "high";
export type Reversibility = "1-way" | "2-way";
export type BlastRadius = "service" | "data" | "platform";

export interface Decision {
  id: string;
  topic: string;
  pick: string;
  /** Short string of rejected alternatives, prefixed with "vs " (e.g.
   *  "vs Cosmos DB · Azure SQL"). */
  vs: string;
  why: string;
  conf: Confidence;
  cite: number;

  reversibility: Reversibility;
  blastRadius: BlastRadius;
  /** Concrete trigger that should re-open this decision. Vague triggers
   *  ("if scale grows") are rejected by the eval rubric. */
  revisitAt: string;
}

// ─── Bill of materials ──────────────────────────────────────────

export type BomKind = "compute" | "data" | "storage" | "network" | "vendor";

export interface BomLine {
  id: string;
  /** Display name (matches an ArchNode.label or is a derived line). */
  name: string;
  kind: BomKind;
  /** Monthly cost at brief baseline scale, in USD. */
  baseCost: number;
  /** Multiplier exponents applied as users / RPS / GB scale up. */
  scaleExp?: { users?: number; rps?: number; gb?: number };
  /** True if cost does not scale with traffic (e.g. base SKU). */
  fixed?: boolean;
  /** % of cost typically absorbed by free tier at MVP scale (0–100). */
  freeTierPct?: number;
  cite: number;
}

// ─── Risks ──────────────────────────────────────────────────────

export type Severity = "low" | "med" | "high";

export interface Risk {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  likelihood: Severity;
  /** Concrete mitigation, ≤ 3 sentences. */
  mitigation: string;
  cite: number;
}

// ─── Flow narrative (packager artifact, locked by ADR-0004) ─────

/** One step in the request-lifecycle explainer rendered under the
 *  architecture diagram and in the exported PDF. */
export interface FlowStep {
  id: string;
  title: string;
  /** ArchNode IDs this step touches, in causal order. */
  nodes: string[];
  /** 2–4 sentence explanation of what happens and why this design. */
  body: string;
}

// ─── Sources, assumptions, requirements, roadmap ────────────────

export interface Source {
  id: number;
  title: string;
  /** Domain or short publisher label ("AWS Docs", "Stripe Pricing"). */
  publisher: string;
  url: string;
  /** ISO date the source was last verified by the orchestrator. */
  verifiedAt: string;
}

export interface Assumption {
  id: string;
  text: string;
  /** Why we made this assumption (brief signal, KB default, etc). */
  basis: string;
  /** What the user can do to override this on the next run. */
  override?: string;
}

export interface Requirement {
  id: string;
  /** Short label ("Users at launch", "Latency budget"). */
  label: string;
  value: string;
  /** Source of the value: brief, clarification answer, or default. */
  source: "brief" | "clarify" | "default";
}

export interface RoadmapItem {
  id: string;
  title: string;
  /** Relative duration ("week 1–2", "month 2"). */
  when: string;
  body: string;
}

// ─── ADR-0006: System-design narrative ─────────────────────────

/** One sequence diagram. Architect emits exactly three per package:
 *  the write path, the read path, and one critical async/admin path. */
export interface SequenceDiagram {
  id: string;
  /** Which canonical path this diagram covers. */
  kind: "write" | "read" | "async";
  title: string;
  /** 1–2 sentence summary of what this path does and why it matters. */
  summary: string;
  /** Mermaid `sequenceDiagram` source. Rendered server-side via mermaid-cli. */
  mermaid: string;
  /** ArchNode IDs participating in this path, in causal order. */
  participants: string[];
}

/** Integration contract for one critical edge in the architecture.
 *  Architect emits one per ArchEdge it marks as critical. */
export interface IntegrationContract {
  /** ArchEdge identifier: "<from>→<to>". */
  edgeId: string;
  from: string;
  to: string;
  /** Synchronous (request/response) vs asynchronous (event/queue). */
  mode: "sync" | "async";
  /** Wire shape — JSON shape sketch, RPC signature, or message schema name. */
  payload: string;
  /** Idempotency strategy: "idempotency-key header", "dedupe by event_id", etc. */
  idempotency: string;
  /** Retry policy: "exponential backoff, 5 attempts, jitter" etc. */
  retry: string;
  /** Failure semantics: "at-least-once", "exactly-once", "best-effort". */
  semantics: "at-least-once" | "exactly-once" | "best-effort";
  cite: number;
}

/** "Fits because" rationale linking a critical component pick to the
 *  specific requirement it satisfies. Stronger than ArchNode.why because
 *  it explicitly references the requirement id it answers. */
export interface ComponentRationale {
  nodeId: string;
  /** Requirement.id this pick directly satisfies. */
  requirementId: string;
  /** 2–3 sentences. Validated by Pydantic for length + grounding. */
  narrative: string;
  cite: number;
}

/** One row in the failure-modes table. Architect emits one per ArchNode
 *  with `failureDomain.length > 0`. */
export interface FailureMode {
  id: string;
  nodeId: string;
  /** Likely failure mode ("connection pool exhaustion", "region outage"). */
  mode: string;
  /** What signal exposes this failure ("5xx spike", "queue depth alarm"). */
  detection: string;
  /** Concrete recovery action, ≤ 3 sentences. */
  recovery: string;
  /** Recovery time objective ("< 5 min", "< 1 h"). */
  rto: string;
  /** Recovery point objective ("0 (sync repl)", "≤ 15 min (PITR)"). */
  rpo: string;
  cite: number;
}

/** One phase in the engineering build sequence. Distinct from RoadmapItem
 *  (which is product roadmap); this is what to stand up first to make
 *  the recommended architecture real. Architect emits 3–6 phases. */
export interface BuildPhase {
  id: string;
  /** Display label ("Week 1", "Week 2–3", "Month 2"). */
  label: string;
  title: string;
  /** ArchNode IDs to stand up in this phase, in dependency order. */
  nodes: string[];
  /** Why this phase first; what's blocked until it ships. */
  rationale: string;
}

// ─── Top-level run package ──────────────────────────────────────

/** Complete contract emitted by the orchestrator's `packager` node.
 *  Persisted to Postgres + serialized to PDF + Markdown. */
export interface RunPackage {
  /** Stable run ID (uuid). */
  id: string;
  /** ISO timestamp the package was assembled. */
  generatedAt: string;
  /** Snapshot id of the KB used for this run (for audit + repro). */
  kbSnapshotId: string;

  /** Brief & elicited requirements. */
  brief: string;
  requirements: Requirement[];
  assumptions: Assumption[];

  /** Architecture. */
  nodes: ArchNode[];
  edges: ArchEdge[];
  /** Per-node alternatives keyed by ArchNode.id. Default = index 0. */
  componentOptions: Record<string, ComponentOption[]>;

  /** Decisions, bill of materials, risks, roadmap. */
  decisions: Decision[];
  bom: BomLine[];
  risks: Risk[];
  roadmap: RoadmapItem[];

  /** ADR-0004 — narrated request lifecycle, 6–8 steps. */
  flowNarrative: FlowStep[];

  /** ADR-0006 — system-design narrative. The architect agent fills these
   *  to make the package read like a designed system, not just described.
   *  All five are required at MVP; eval graders enforce coherence + grounding. */
  sequenceDiagrams: SequenceDiagram[];
  integrationContracts: IntegrationContract[];
  componentRationales: ComponentRationale[];
  failureModes: FailureMode[];
  buildSequence: BuildPhase[];

  /** Citations referenced by `cite` fields above. */
  sources: Source[];
}
