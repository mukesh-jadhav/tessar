/**
 * Adapter — `RunPackage` (the persisted artifact contract) → `DecideData`
 * (the prop shape the /decide studio prototype was built around).
 *
 * The studio's internal data types carry richer presentation-only fields
 * (e.g. `Phase` enum on `appearsAt`, `category` on assumptions, area /
 * effort / owner on risks) that the orchestrator does not yet emit.
 * Where we can't recover them, we synthesize sensible defaults so the
 * lenses stay readable rather than blank — but everything that drives
 * trust (citations, decisions, BOM, risks, sources) is preserved
 * verbatim from the RunPackage.
 */
import type {
  DecideData,
  // Re-exported by decide-studio so we don't pull duplicate type defs.
} from "@/components/decide/decide-studio";
import type {
  ArchEdge as PkgEdge,
  ArchNode as PkgNode,
  Assumption as PkgAssumption,
  BomLine as PkgBom,
  ComponentOption as PkgOption,
  DataClass as PkgDataClass,
  Decision as PkgDecision,
  Risk as PkgRisk,
  RoadmapItem as PkgRoadmap,
  RunPackage,
  Source as PkgSource,
} from "@/lib/run-package";

// Re-typed locally so this file stays self-describing without importing
// every studio-internal type. The studio's DecideData enforces these
// shapes at the assignment site; this file just builds the structure.

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

type StudioIcon =
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

const ICON_FALLBACK: StudioIcon = "cpu";
const VALID_ICONS = new Set<StudioIcon>([
  "user",
  "shield",
  "globe",
  "cpu",
  "queue",
  "flash",
  "db",
  "bucket",
  "sparkle",
  "card",
]);

const VALID_PHASES = new Set<Phase>([
  "intake",
  "requirements",
  "research_plan",
  "research_workers",
  "synthesizer",
  "architect",
  "cost",
  "risk",
  "packager",
]);

function coercePhase(s: string | undefined, fallback: Phase = "architect"): Phase {
  if (s && VALID_PHASES.has(s as Phase)) return s as Phase;
  return fallback;
}

function coerceIcon(s: string | undefined): StudioIcon {
  if (s && VALID_ICONS.has(s as StudioIcon)) return s as StudioIcon;
  return ICON_FALLBACK;
}

function mapDataClass(dc: PkgDataClass): "pii" | "secret" | "payment" | "public" | "internal" {
  switch (dc) {
    case "public":
      return "public";
    case "internal":
      return "internal";
    case "confidential":
      return "secret";
    case "regulated":
      return "pii";
    default:
      return "internal";
  }
}

function mapNode(n: PkgNode, idx: number): DecideData["nodes"][number] {
  return {
    id: n.id,
    label: n.label,
    sub: n.sub,
    zone: n.zone,
    x: n.x,
    y: n.y,
    w: n.w,
    cite: n.cite,
    appearsAt: coercePhase(n.appearsAt, idx < 3 ? "intake" : "architect"),
    icon: coerceIcon(n.icon),
    scaleChip: n.scaleChip,
    why: n.why,
    scale: n.scale.map((s) => ({ tier: s.tier, note: s.note })),
    alts: n.alts,
    dataClass: mapDataClass(n.dataClass),
    failureDomain: n.failureDomain,
  };
}

function mapEdge(e: PkgEdge): DecideData["edges"][number] {
  // Studio's EdgeKind has the same set as RunPackage's.
  return {
    from: e.from,
    to: e.to,
    kind: e.kind === "data" ? "async" : e.kind,
    label: e.label,
    curve: e.curve,
    appearsAt: coercePhase(e.appearsAt, "architect"),
    qps: e.qps,
    p95: e.p95,
    retry: e.retry,
    payload: e.payload,
  };
}

function mapDecision(d: PkgDecision): DecideData["decisions"][number] {
  return {
    id: d.id,
    topic: d.topic,
    pick: d.pick,
    vs: d.vs,
    why: d.why,
    conf: d.conf,
    cite: d.cite,
    revealsAt: "synthesizer",
    reversibility: d.reversibility,
    blastRadius: d.blastRadius,
    revisitAt: d.revisitAt,
  };
}

function mapBom(l: PkgBom): DecideData["bom"][number] {
  // Per-knob multipliers — RunPackage stores this as `scaleExp`; the
  // studio uses `per`. Default to 1× on each axis when missing so the
  // cost dial still produces stable totals.
  const per = {
    users: l.scaleExp?.users ?? 1,
    rps: l.scaleExp?.rps ?? 1,
    gb: l.scaleExp?.gb ?? 1,
  };
  // Map BOM kind → studio cost-category bucket.
  const kind: "compute" | "data" | "network" | "vendor" | "observability" =
    l.kind === "compute"
      ? "compute"
      : l.kind === "data" || l.kind === "storage"
        ? "data"
        : l.kind === "network"
          ? "network"
          : l.kind === "vendor"
            ? "vendor"
            : "observability";
  return {
    id: l.id,
    service: l.name,
    sku: l.kind,
    base: l.baseCost,
    per,
    cite: l.cite,
    fixed: l.fixed,
    freeTierPct: l.freeTierPct,
    why: "",
    kind,
  };
}

function inferArea(title: string): string {
  const t = title.toLowerCase();
  if (/cost|spend|budget/.test(t)) return "Cost";
  if (/latency|cold|slow|p95/.test(t)) return "Latency";
  if (/security|injection|auth|secret/.test(t)) return "Security";
  if (/availability|outage|region|sla/.test(t)) return "Availability";
  if (/lock-?in|migrat|vendor/.test(t)) return "Lock-in";
  if (/quota|throttl|provider/.test(t)) return "Vendor";
  return "Risk";
}

function mapRisk(r: PkgRisk): DecideData["risks"][number] {
  return {
    id: r.id,
    title: r.title,
    area: inferArea(r.title),
    likelihood: r.likelihood,
    impact: r.severity,
    detail: r.body,
    mitigation: r.mitigation,
    cite: r.cite,
    effort: "days",
    owner: "eng",
    precondition: "Always — watched continuously",
  };
}

function inferAssumptionCategory(text: string): "scale" | "compliance" | "team" | "slo" | "domain" {
  const t = text.toLowerCase();
  if (/region|residency|gdpr|pii|compliance|encrypt|audit/.test(t)) return "compliance";
  if (/team|engineer|on-?call|ops|hire/.test(t)) return "team";
  if (/slo|sla|latency|uptime|availability/.test(t)) return "slo";
  if (/domain|saas|b2b|b2c|industry|product/.test(t)) return "domain";
  return "scale";
}

function mapAssumption(a: PkgAssumption): DecideData["assumptions"][number] {
  return {
    id: a.id,
    category: inferAssumptionCategory(a.text),
    text: a.text,
    impact: a.basis,
    editable: a.override === undefined,
  };
}

function mapRoadmapPhase(when: string): "Day 1" | "Week 1" | "Month 1" | "Quarter 1" {
  const w = when.toLowerCase();
  if (/day/.test(w)) return "Day 1";
  if (/week/.test(w)) return "Week 1";
  if (/month/.test(w)) return "Month 1";
  if (/quarter|q[1-4]/.test(w)) return "Quarter 1";
  // Default to the earliest bucket so we don't accidentally hide work.
  return "Day 1";
}

function mapRoadmap(r: PkgRoadmap): DecideData["roadmap"][number] {
  return {
    id: r.id,
    phase: mapRoadmapPhase(r.when),
    title: r.title,
    effort: r.body.split(/[.·]/)[0]!.slice(0, 60).trim() || "—",
    owner: "eng",
  };
}

function mapSource(s: PkgSource): DecideData["sources"][number] {
  const isWeb = /^https?:\/\//.test(s.url);
  return {
    n: s.id,
    kind: isWeb ? "Web" : "KB",
    text: `${s.title} · ${s.publisher}`,
  };
}

function mapComponentOptions(opts: Record<string, PkgOption[]>): DecideData["componentOptions"] {
  const out: DecideData["componentOptions"] = {};
  for (const [k, list] of Object.entries(opts)) {
    out[k] = list.map((o) => ({
      id: o.id,
      label: o.label,
      sub: o.sub,
      costMul: o.costMul,
      remove: o.remove,
      note: o.note,
    }));
  }
  return out;
}

/**
 * Build a `DecideData` payload from a persisted `RunPackage`. Lenses that
 * the orchestrator does not yet populate (latency hops, error path,
 * package gaps) fall through with empty defaults so the studio renders
 * cleanly rather than crashing.
 */
export function mapRunPackageToDecide(pkg: RunPackage): DecideData {
  return {
    nodes: pkg.nodes.map((n, i) => mapNode(n, i)),
    edges: pkg.edges.map(mapEdge),
    decisions: pkg.decisions.map(mapDecision),
    bom: pkg.bom.map(mapBom),
    risks: pkg.risks.map(mapRisk),
    assumptions: pkg.assumptions.map(mapAssumption),
    roadmap: pkg.roadmap.map(mapRoadmap),
    sources: pkg.sources.map(mapSource),
    componentOptions: mapComponentOptions(pkg.componentOptions),
    orgConstraints: [],
    latencyHops: [],
    errorPath: [],
    packageGaps: [],
    auditMeta: [
      { label: "Generated", value: pkg.generatedAt },
      { label: "KB snapshot", value: pkg.kbSnapshotId },
      { label: "Sources cited", value: String(pkg.sources.length) },
    ],
    brief: pkg.brief,
  };
}
