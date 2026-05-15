/**
 * Local mirror of `@tessar/shared-schemas` `RunPackage` (ADR-0004).
 *
 * Mirrored manually rather than depending on the workspace package so the
 * `apps/web` Docker build stays self-contained. If you change a field
 * here, change it in `packages/shared-schemas/index.ts` and the Pydantic
 * mirror in `apps/orchestrator/tessar/schemas/` in the same PR.
 */

export type Zone = "client" | "edge" | "app" | "data" | "external";
export type DataClass = "public" | "internal" | "confidential" | "regulated";
export type Confidence = "low" | "med" | "high";
export type Severity = "low" | "med" | "high";
export type Reversibility = "1-way" | "2-way";
export type BlastRadius = "service" | "data" | "platform";
export type EdgeKind = "sync" | "async" | "data" | "external";
export type BomKind = "compute" | "data" | "storage" | "network" | "vendor";

export interface ScaleTier {
  tier: "1×" | "10×" | "100×";
  note: string;
}

export interface ArchNode {
  id: string;
  label: string;
  sub: string;
  zone: Zone;
  icon: string;
  cite: number;
  dataClass: DataClass;
  failureDomain: string[];
  why: string;
  scale: [ScaleTier, ScaleTier, ScaleTier];
  alts: string;
  scaleChip?: string;
  appearsAt?: string;
  x: number;
  y: number;
  w: number;
}

export interface ArchEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  curve?: number;
  appearsAt?: string;
  qps?: string;
  p95?: string;
  retry?: string;
  payload?: string;
}

export interface ComponentOption {
  id: string;
  label: string;
  sub: string;
  note: string;
  costMul: number;
  remove?: boolean;
}

export interface Decision {
  id: string;
  topic: string;
  pick: string;
  vs: string;
  why: string;
  conf: Confidence;
  cite: number;
  reversibility: Reversibility;
  blastRadius: BlastRadius;
  revisitAt: string;
}

export interface BomLine {
  id: string;
  name: string;
  kind: BomKind;
  baseCost: number;
  scaleExp?: { users?: number; rps?: number; gb?: number };
  fixed?: boolean;
  freeTierPct?: number;
  cite: number;
}

export interface Risk {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  likelihood: Severity;
  mitigation: string;
  cite: number;
}

export interface FlowStep {
  id: string;
  title: string;
  nodes: string[];
  body: string;
}

export interface Source {
  id: number;
  title: string;
  publisher: string;
  url: string;
  verifiedAt: string;
}

export interface Assumption {
  id: string;
  text: string;
  basis: string;
  override?: string;
}

export interface Requirement {
  id: string;
  label: string;
  value: string;
  source: "brief" | "clarify" | "default";
}

export interface RoadmapItem {
  id: string;
  title: string;
  when: string;
  body: string;
}

// ─── ADR-0006: System-design narrative ──────────────────────────────────────
// Required at MVP launch (see docs/adr/0006-...). Optional in this web mirror
// so Phase 1/2 mock packages don't need to be backfilled during the prototype
// phase. Phase 3 architect agent must populate all five.

export interface SequenceDiagram {
  id: string;
  kind: "write" | "read" | "async";
  title: string;
  summary: string;
  /** Mermaid sequenceDiagram source. */
  mermaid: string;
  /** ArchNode IDs participating, in causal order. */
  participants: string[];
}

export interface IntegrationContract {
  edgeId: string;
  from: string;
  to: string;
  mode: "sync" | "async";
  payload: string;
  idempotency: string;
  retry: string;
  semantics: "at-least-once" | "exactly-once" | "best-effort";
  cite: number;
}

export interface ComponentRationale {
  nodeId: string;
  requirementId: string;
  narrative: string;
  cite: number;
}

export interface FailureMode {
  id: string;
  nodeId: string;
  mode: string;
  detection: string;
  recovery: string;
  rto: string;
  rpo: string;
  cite: number;
}

export interface BuildPhase {
  id: string;
  label: string;
  title: string;
  nodes: string[];
  rationale: string;
}

export interface RunPackage {
  id: string;
  generatedAt: string;
  kbSnapshotId: string;
  brief: string;
  requirements: Requirement[];
  assumptions: Assumption[];
  nodes: ArchNode[];
  edges: ArchEdge[];
  componentOptions: Record<string, ComponentOption[]>;
  decisions: Decision[];
  bom: BomLine[];
  risks: Risk[];
  roadmap: RoadmapItem[];
  flowNarrative: FlowStep[];
  // ADR-0006 — optional during prototype, required at MVP launch.
  sequenceDiagrams?: SequenceDiagram[];
  integrationContracts?: IntegrationContract[];
  componentRationales?: ComponentRationale[];
  failureModes?: FailureMode[];
  buildSequence?: BuildPhase[];
  sources: Source[];
}
