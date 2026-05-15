/**
 * Recorded run — the canonical demo timeline replayed by `/api/mock-runs/[id]/events`.
 *
 * Each event is one of:
 *   - `phase`     : a graph node started or completed
 *   - `decision`  : a Decision converged with a confidence score
 *   - `source`    : a web/KB source consumed by a worker
 *   - `clarify`   : the orchestrator paused and asked the user a question
 *   - `metric`    : a one-line counter update (tokens, cost, sources)
 *   - `done`      : the run finished and artifacts are ready
 *   - `hello`     : synthetic, emitted by the route handler on connect
 *
 * `t` is the offset in ms from run start. The route handler sleeps the
 * delta between events (scaled by ?speed=) so the live UI feels real.
 *
 * Locked by ADR-0004: the per-event shape mirrors what Phase-2 Postgres
 * `run_events` will store, so the consumer doesn't change between phases.
 */

export type Phase =
  | "intake_normalizer"
  | "requirements_extractor"
  | "research_planner"
  | "research_workers"
  | "synthesizer"
  | "architect"
  | "cost_estimator"
  | "risk_writer"
  | "packager";

export type RecordedEvent =
  | {
      kind: "phase";
      t: number;
      payload: {
        phase: Phase;
        status: "started" | "completed" | "failed";
        /** Optional one-liner shown in the timeline ("Picked Postgres + pgvector"). */
        note?: string;
      };
    }
  | {
      kind: "decision";
      t: number;
      payload: {
        id: string;
        topic: string;
        pick: string;
        conf: "low" | "med" | "high";
      };
    }
  | {
      kind: "source";
      t: number;
      payload: { id: number; title: string; publisher: string };
    }
  | {
      kind: "clarify";
      t: number;
      payload: {
        id: string;
        question: string;
        /** ≤ 4 quick-pick chip labels for the bottom-sheet UI. */
        chips: string[];
      };
    }
  | {
      kind: "metric";
      t: number;
      payload: {
        tokens: number;
        costUsd: number;
        sources: number;
      };
    }
  | {
      kind: "done";
      t: number;
      payload: { runId: string };
    }
  | {
      kind: "hello";
      t: number;
      payload: { runId: string };
    };

const PH = (
  t: number,
  phase: Phase,
  status: "started" | "completed" | "failed",
  note?: string,
): RecordedEvent => ({ kind: "phase", t, payload: { phase, status, note } });

export const RECORDED_RUN: RecordedEvent[] = [
  // ── intake / requirements (0 – 30 s) ─────────────────────────
  PH(800, "intake_normalizer", "started"),
  { kind: "metric", t: 1200, payload: { tokens: 540, costUsd: 0.002, sources: 0 } },
  PH(2400, "intake_normalizer", "completed", "Brief normalized · domain = B2B SaaS"),

  PH(2700, "requirements_extractor", "started"),
  {
    kind: "source",
    t: 4800,
    payload: { id: 1, title: "GDPR data-residency overview", publisher: "EU Commission" },
  },
  {
    kind: "clarify",
    t: 6400,
    payload: {
      id: "q1",
      question: "Region — EU only, US only, or both?",
      chips: ["EU only", "US only", "Both", "No preference"],
    },
  },
  PH(11000, "requirements_extractor", "completed", "5k MAU · EU residency · 200ms p95"),

  // ── research (30 – 5 min) ────────────────────────────────────
  PH(11200, "research_planner", "started"),
  PH(13800, "research_planner", "completed", "8 questions to answer"),

  PH(14000, "research_workers", "started", "8 workers in parallel"),
  {
    kind: "source",
    t: 15200,
    payload: { id: 2, title: "Cloud Run pricing & cold-start", publisher: "GCP Docs" },
  },
  {
    kind: "source",
    t: 16100,
    payload: { id: 3, title: "pgvector benchmarks at 1M rows", publisher: "Supabase Blog" },
  },
  { kind: "metric", t: 17000, payload: { tokens: 18400, costUsd: 0.064, sources: 3 } },
  {
    kind: "source",
    t: 18900,
    payload: { id: 4, title: "Pub/Sub vs Service Bus latency", publisher: "Cloud Native Now" },
  },
  {
    kind: "source",
    t: 21500,
    payload: { id: 5, title: "Tavily Search API limits", publisher: "Tavily Docs" },
  },
  {
    kind: "source",
    t: 24800,
    payload: { id: 6, title: "Memorystore Redis Streams patterns", publisher: "GCP Docs" },
  },
  { kind: "metric", t: 27000, payload: { tokens: 41200, costUsd: 0.18, sources: 6 } },
  {
    kind: "source",
    t: 30200,
    payload: { id: 7, title: "GDPR-compliant LLM routing", publisher: "Hashicorp Blog" },
  },
  PH(33000, "research_workers", "completed", "8/8 workers returned"),

  // ── synthesis & architecture (5 – 8 min) ─────────────────────
  PH(33200, "synthesizer", "started"),
  {
    kind: "decision",
    t: 35400,
    payload: {
      id: "d-db",
      topic: "Primary database",
      pick: "Cloud SQL Postgres + pgvector",
      conf: "high",
    },
  },
  {
    kind: "decision",
    t: 37800,
    payload: {
      id: "d-queue",
      topic: "Job queue",
      pick: "Pub/Sub + push subscription",
      conf: "high",
    },
  },
  {
    kind: "decision",
    t: 40200,
    payload: {
      id: "d-llm",
      topic: "LLM router",
      pick: "Vertex Gemini → Claude → OpenAI fallback",
      conf: "med",
    },
  },
  PH(43000, "synthesizer", "completed", "11 components picked · all cited"),

  PH(43200, "architect", "started"),
  { kind: "metric", t: 45000, payload: { tokens: 78400, costUsd: 0.39, sources: 7 } },
  PH(48400, "architect", "completed", "C4 + data-flow + sequence emitted"),

  // ── cost + risk + package (8 – 12 min) ───────────────────────
  PH(48600, "cost_estimator", "started"),
  PH(52800, "cost_estimator", "completed", "$184/mo idle · $1,910 at 10×"),

  PH(53000, "risk_writer", "started"),
  {
    kind: "decision",
    t: 55400,
    payload: { id: "d-cdn", topic: "Edge / WAF", pick: "Cloud Armor + Cloud CDN", conf: "high" },
  },
  PH(58000, "risk_writer", "completed", "6 risks · 4 mitigations"),

  PH(58200, "packager", "started"),
  { kind: "metric", t: 60000, payload: { tokens: 96400, costUsd: 0.51, sources: 7 } },
  PH(64200, "packager", "completed", "PDF + Markdown rendered"),

  { kind: "done", t: 64500, payload: { runId: "demo" } },
];

/** Friendly labels for each phase, used in the timeline UI. */
export const PHASE_LABELS: Record<Phase, string> = {
  intake_normalizer: "Reading the brief",
  requirements_extractor: "Extracting requirements",
  research_planner: "Planning research",
  research_workers: "Researching the open web",
  synthesizer: "Picking components",
  architect: "Drawing the architecture",
  cost_estimator: "Estimating cost",
  risk_writer: "Writing trade-offs & risks",
  packager: "Packaging the deliverable",
};

export const PHASE_ORDER: Phase[] = [
  "intake_normalizer",
  "requirements_extractor",
  "research_planner",
  "research_workers",
  "synthesizer",
  "architect",
  "cost_estimator",
  "risk_writer",
  "packager",
];
