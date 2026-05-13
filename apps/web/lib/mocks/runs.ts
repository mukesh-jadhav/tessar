import type { RunSummary } from "./types";

export const mockRuns: RunSummary[] = [
  {
    id: "run_01HXYZ_ACME",
    title: "Acme — B2B usage analytics",
    briefSnippet:
      "Multi-tenant SaaS that ingests product events, computes usage metrics, and bills customers monthly.",
    cloud: "gcp",
    status: "completed",
    createdAt: "2026-05-08T14:21:00Z",
    completedAt: "2026-05-08T14:31:42Z",
    durationMs: 642_000,
  },
  {
    id: "run_01HXYZ_LOOPLY",
    title: "Looply — async standup tool",
    briefSnippet:
      "Slack-first tool. Users record short video updates; team can scrub a daily digest. ~5K teams expected in year 1.",
    cloud: "gcp",
    status: "completed",
    createdAt: "2026-05-05T09:10:00Z",
    completedAt: "2026-05-05T09:23:11Z",
    durationMs: 791_000,
  },
  {
    id: "run_01HXYZ_PARSEC",
    title: "Parsec — invoice OCR API",
    briefSnippet:
      "Public API. Customers POST a PDF; we return structured line items. Throughput target ~50 req/s sustained.",
    cloud: "multi",
    status: "running",
    createdAt: "2026-05-11T11:02:00Z",
  },
];
