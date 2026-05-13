/**
 * Sample-package metadata for the /decide showcase.
 *
 * Phase 1 only swaps header context (brief title + persona). The diagram
 * fixtures inside /decide stay intact because they are deeply wired into
 * focus state, popover content, and timeline animations. Phase 3 will
 * back this with real RunPackage payloads from `@tessar/shared-schemas`.
 */

export type SampleId = "saas" | "marketplace" | "events";

export interface SamplePackage {
  id: SampleId;
  /** Short label used inside the chip group. */
  label: string;
  /** Persona / domain bucket. */
  persona: string;
  /** Headline shown in the /decide header in place of "Sample brief". */
  briefTitle: string;
  /** 1-line context shown under the title. */
  briefOneLiner: string;
  /** Order-of-magnitude usage assumption shown in the persona banner. */
  scaleAssumption: string;
}

export const SAMPLE_PACKAGES: SamplePackage[] = [
  {
    id: "saas",
    label: "B2B SaaS",
    persona: "Workflow tool for ops teams",
    briefTitle: "Multi-tenant workflow tool for ops teams",
    briefOneLiner:
      "5k MAU at launch · 200 customers · EU data residency · SOC 2 in Y1.",
    scaleAssumption: "5k MAU → 50k MAU in 18 months",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    persona: "Two-sided design marketplace",
    briefTitle: "Two-sided marketplace · designers ↔ small businesses",
    briefOneLiner:
      "Escrow via Stripe Connect · 20k buyers Y1 · search + reviews · global.",
    scaleAssumption: "20k buyers, 2k sellers, 60k active listings",
  },
  {
    id: "events",
    label: "Event ingest",
    persona: "Mobile analytics SDK backend",
    briefTitle: "Mobile analytics SDK backend",
    briefOneLiner:
      "10M events/day per customer · 200 customers · 30-day query window.",
    scaleAssumption: "2B events/day aggregate · sub-second p95 ingest ack",
  },
];

export const DEFAULT_SAMPLE: SampleId = "saas";

export function getSample(id: string | null | undefined): SamplePackage {
  const found = SAMPLE_PACKAGES.find((s) => s.id === id);
  return found ?? SAMPLE_PACKAGES[0]!;
}
