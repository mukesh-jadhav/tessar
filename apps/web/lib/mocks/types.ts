/**
 * Mock fixtures for Phase 1 UI prototype.
 *
 * These types intentionally live here (not in `packages/shared-schemas`) until
 * Phase 2 introduces the real Pydantic-generated schemas. When that happens,
 * delete the local types and re-import from `@tessar/shared-schemas`.
 */

export type Cloud = "gcp" | "aws" | "azure" | "multi";

export type RunStatus = "draft" | "queued" | "running" | "completed" | "failed";

export type AgentPhase =
  | "intake_normalizer"
  | "requirements_extractor"
  | "research_planner"
  | "research_worker"
  | "synthesizer"
  | "architect"
  | "cost_estimator"
  | "risk_writer"
  | "packager";

export interface RunSummary {
  id: string;
  title: string;
  briefSnippet: string;
  cloud: Cloud;
  status: RunStatus;
  createdAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ProgressEvent {
  /** Milliseconds from run start. */
  t: number;
  phase: AgentPhase;
  kind: "phase_started" | "phase_completed" | "decision" | "source_added" | "clarify_needed";
  title: string;
  detail?: string;
  /** For `decision` events. */
  confidence?: "low" | "med" | "high";
}

export interface Source {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  snapshotDate: string;
}

export interface BomItem {
  category: string;
  choice: string;
  alternatives: string[];
  monthlyUsd: number;
  confidence: "low" | "med" | "high";
  sourceIds: string[];
}

export interface DesignPackage {
  runId: string;
  summary: string;
  cloud: Cloud;
  bom: BomItem[];
  monthlyTotalUsd: number;
  sources: Source[];
}
