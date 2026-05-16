/**
 * Pure-function synthesis helpers for the post-run reader.
 *
 * Phase 1: everything here derives the "executive summary" payload from
 * existing `RunPackage` fields — no new orchestrator contract, no new mock
 * surface. When the architect / synthesizer agents in Phase 3 start
 * emitting explicit "headline" payloads we'll swap these out, but the
 * UI shape they produce stays the same so this is a safe seam.
 *
 * Functions here are deterministic and side-effect free so they can be
 * memoised cheaply in React.
 */

import type {
  BomLine,
  BuildPhase,
  ComponentRationale,
  Decision,
  Requirement,
  RunPackage,
} from "./run-package";

const CONF_ORDER: Record<string, number> = { high: 0, med: 1, low: 2 };
const REV_ORDER: Record<string, number> = { "1-way": 0, "2-way": 1 };
const BLAST_ORDER: Record<string, number> = { platform: 0, data: 1, service: 2 };
const SEV_ORDER: Record<string, number> = { high: 0, med: 1, low: 2 };

/** Top N picks that form the "shape" of the system. */
export function headlinePicks(decisions: Decision[], n: number = 5): Decision[] {
  return [...decisions]
    .sort((a, b) => {
      const c = (CONF_ORDER[a.conf] ?? 9) - (CONF_ORDER[b.conf] ?? 9);
      if (c !== 0) return c;
      const r = (REV_ORDER[a.reversibility] ?? 9) - (REV_ORDER[b.reversibility] ?? 9);
      if (r !== 0) return r;
      return (BLAST_ORDER[a.blastRadius] ?? 9) - (BLAST_ORDER[b.blastRadius] ?? 9);
    })
    .slice(0, n);
}

/** Sum of baseline monthly cost. */
export function baselineCost(bom: BomLine[]): number {
  return bom.reduce((sum, l) => sum + (l.baseCost || 0), 0);
}

/** Sum at a uniform multi-axis scale factor. */
export function costAtScale(
  bom: BomLine[],
  usersMul: number,
  rpsMul: number,
  gbMul: number,
): number {
  return bom.reduce((sum, l) => {
    if (l.fixed) return sum + (l.baseCost || 0);
    const exp = l.scaleExp ?? {};
    const factor =
      Math.pow(usersMul, exp.users ?? 0) *
      Math.pow(rpsMul, exp.rps ?? 0) *
      Math.pow(gbMul, exp.gb ?? 0);
    return sum + (l.baseCost || 0) * factor;
  }, 0);
}

/** Single most-expensive line. Often the cost lever the user cares about. */
export function topCostLine(bom: BomLine[]): BomLine | null {
  if (!bom.length) return null;
  return [...bom].sort((a, b) => (b.baseCost || 0) - (a.baseCost || 0))[0] ?? null;
}

/** Highest-severity, highest-likelihood risk for the headline. */
export function topRisk(pkg: Pick<RunPackage, "risks">): RunPackage["risks"][number] | null {
  if (!pkg.risks.length) return null;
  return (
    [...pkg.risks].sort((a, b) => {
      const sev = (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
      if (sev !== 0) return sev;
      return (SEV_ORDER[a.likelihood] ?? 9) - (SEV_ORDER[b.likelihood] ?? 9);
    })[0] ?? null
  );
}

/** Group decisions into "foundational" (1-way + platform/data blast) vs "dependent". */
export function groupDecisionsByTier(decisions: Decision[]): {
  foundational: Decision[];
  dependent: Decision[];
} {
  const foundational: Decision[] = [];
  const dependent: Decision[] = [];
  for (const d of decisions) {
    const isPlatform = d.blastRadius === "platform" || d.blastRadius === "data";
    const isLocked = d.reversibility === "1-way";
    if (isPlatform || isLocked) foundational.push(d);
    else dependent.push(d);
  }
  return { foundational, dependent };
}

export interface RequirementMapping {
  requirement: Requirement;
  rationales: Array<{
    rationale: ComponentRationale;
    nodeLabel: string;
    nodeSub: string;
  }>;
}

/**
 * Pair every requirement with the component rationales that cite it.
 *
 * Rationale.requirementId is a free-form string from the orchestrator
 * (e.g. "req-scale"). We match on either the requirement's stable `id`
 * or — when the agent only wrote the requirement's `label` — on the
 * lowercased label as a fallback. Requirements with no matching
 * rationale still appear; the UI just shows them without a target.
 */
export function mapRequirementsToArchitecture(pkg: RunPackage): RequirementMapping[] {
  const nodeById = new Map(pkg.nodes.map((n) => [n.id, n]));
  return pkg.requirements.map((req) => {
    const matches = pkg.componentRationales.filter((r) => {
      if (r.requirementId === req.id) return true;
      const labelKey = (req.label || "").toLowerCase().replace(/\s+/g, "-");
      return labelKey && r.requirementId === labelKey;
    });
    return {
      requirement: req,
      rationales: matches.map((r) => {
        const node = nodeById.get(r.nodeId);
        return {
          rationale: r,
          nodeLabel: node?.label ?? r.nodeId,
          nodeSub: node?.sub ?? "",
        };
      }),
    };
  });
}

/** First 3 build phases — the "what you do first" answer. */
export function firstPhases(seq: BuildPhase[], n: number = 3): BuildPhase[] {
  return seq.slice(0, n);
}

export interface ExecutiveSummary {
  /** Stack picks that define the shape. */
  picks: Decision[];
  /** First phases of the build sequence. */
  phases: BuildPhase[];
  /** Baseline monthly cost. */
  baseline: number;
  /** At 10× users/rps/gb. */
  scaled10x: number;
  /** Most expensive single line, for "where the money goes". */
  costDriver: BomLine | null;
  /** Top risk worth highlighting. */
  risk: RunPackage["risks"][number] | null;
}

export function deriveExecutiveSummary(pkg: RunPackage): ExecutiveSummary {
  return {
    picks: headlinePicks(pkg.decisions, 5),
    phases: firstPhases(pkg.buildSequence, 3),
    baseline: baselineCost(pkg.bom),
    scaled10x: costAtScale(pkg.bom, 10, 10, 10),
    costDriver: topCostLine(pkg.bom),
    risk: topRisk(pkg),
  };
}
