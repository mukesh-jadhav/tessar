/**
 * Mock past-run summaries — used by /dashboard and /billing.
 *
 * Phase 2 will replace this with rows from the `runs` table.
 */

export type RunStatus = "completed" | "failed" | "in_progress" | "refunded";

export interface RunSummary {
  id: string;
  /** ≤ 90-char snippet of the brief, used as the card title. */
  brief: string;
  status: RunStatus;
  /** Domain bucket inferred at intake (B2B SaaS, Marketplace, Data, …). */
  domain: string;
  /** ISO timestamp the run was created. */
  createdAt: string;
  /** Wall-clock duration in seconds; 0 if still running. */
  durationSec: number;
  /** USD amount paid; 0 for in_progress / refunded. */
  paidUsd: number;
  /** Number of components in the package; 0 if not yet rendered. */
  components: number;
  /** Number of cited sources. */
  sources: number;
}

export const PAST_RUNS: RunSummary[] = [
  {
    id: "r4f3a2b",
    brief:
      "B2B workflow automation tool for ops teams · 5k MAU at launch · multi-tenant · EU residency.",
    status: "completed",
    domain: "B2B SaaS",
    createdAt: "2026-05-08T14:22:00Z",
    durationSec: 712,
    paidUsd: 10,
    components: 11,
    sources: 17,
  },
  {
    id: "r2c9d11",
    brief:
      "Two-sided marketplace · designers ↔ small businesses · escrow via Stripe Connect · 20k buyers Y1.",
    status: "completed",
    domain: "Marketplace",
    createdAt: "2026-05-04T09:11:00Z",
    durationSec: 845,
    paidUsd: 10,
    components: 13,
    sources: 22,
  },
  {
    id: "rb71e44",
    brief:
      "Mobile analytics SDK backend · ~10M events/day per customer · 30-day query window · 200 customers.",
    status: "completed",
    domain: "Data / ML",
    createdAt: "2026-04-29T17:48:00Z",
    durationSec: 968,
    paidUsd: 10,
    components: 12,
    sources: 19,
  },
  {
    id: "r8a13c0",
    brief:
      "Internal tool for finance team · monthly reconciliation across 4 SaaS sources · ~30 users · SOC 2.",
    status: "refunded",
    domain: "Internal tool",
    createdAt: "2026-04-21T11:02:00Z",
    durationSec: 612,
    paidUsd: 0,
    components: 9,
    sources: 14,
  },
  {
    id: "r99e81f",
    brief:
      "B2C habit tracker · 50k MAU target · gamification + push notifications · low-cost stance.",
    status: "completed",
    domain: "B2C app",
    createdAt: "2026-04-12T08:35:00Z",
    durationSec: 681,
    paidUsd: 10,
    components: 10,
    sources: 16,
  },
];
