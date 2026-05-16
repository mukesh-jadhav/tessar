"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfidencePill } from "@/components/ui/confidence-pill";
import { SystemDesignPane } from "@/components/package/system-design-sections";
import { ThemeToggle } from "@/components/theme-toggle";
import type {
  ArchEdge,
  ArchNode,
  BomLine,
  Decision,
  FlowStep,
  Risk,
  RunPackage,
  Source,
  Zone,
} from "@/lib/run-package";

/* ---------------------------------------------------------------------------
 * <PackageView /> — In-app reader for a finished run package.
 *
 * Tabs (single viewport, scroll within each tab body):
 *   Overview · Architecture · Components · Decisions · Risks · Sources
 *
 * Mobile + light/dark friendly; tokens come from the M3 CSS variables so
 * theming is automatic. Diagrams are rendered as inline SVG using the
 * architect's emitted x/y/w coordinates (100×100 viewBox), so we don't
 * pull Mermaid into the client bundle for what is essentially a layout
 * the worker already computed.
 * ------------------------------------------------------------------------- */

type Tab =
  | "overview"
  | "architecture"
  | "system-design"
  | "components"
  | "decisions"
  | "risks"
  | "sources";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "system-design", label: "System design" },
  { id: "components", label: "Components" },
  { id: "decisions", label: "Decisions" },
  { id: "risks", label: "Risks" },
  { id: "sources", label: "Sources" },
];

interface Props {
  runId: string;
  pkg: RunPackage;
  hasMd: boolean;
  hasPdf: boolean;
  completedAt: string | null;
}

export function PackageView({ runId, pkg, hasMd, hasPdf, completedAt }: Props): React.ReactElement {
  const [tab, setTab] = useState<Tab>("overview");

  const totalCost = useMemo(
    () => pkg.bom.reduce((sum, l) => sum + (l.baseCost || 0), 0),
    [pkg.bom],
  );

  const briefTitle = useMemo(() => {
    const firstLine =
      (pkg.brief || "")
        .split("\n")
        .map((s) => s.trim())
        .find(Boolean) ?? "Untitled run";
    return firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine;
  }, [pkg.brief]);

  const completedLabel = useMemo(() => {
    if (!completedAt) return "Just now";
    try {
      return new Date(completedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return completedAt;
    }
  }, [completedAt]);

  return (
    <div className="bg-surface text-on-surface min-h-dvh w-full">
      {/* Soft brand wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 88% 12%, rgb(var(--md-sys-color-primary) / 0.08), transparent 70%)",
        }}
      />

      <header className="border-outline-variant/60 bg-surface/80 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4 backdrop-blur md:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="Home" className="flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden
              className="bg-primary text-on-primary grid size-7 place-items-center rounded-full"
            >
              <svg width="12" height="12" viewBox="0 0 11 11" fill="none">
                <path
                  d="M1.5 5.6 L4.2 8 L9 2.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[13px] font-semibold tracking-tight">TESSAR</span>
          </Link>
          <span className="text-on-surface-variant text-[12px]">·</span>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight">{briefTitle}</h1>
            <p className="text-on-surface-variant truncate text-[11px]">
              run #{runId.slice(0, 8)} · completed {completedLabel}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/run/${runId}`}>
            <Button variant="text" size="sm">
              ← Back to run
            </Button>
          </Link>
          {hasMd ? (
            <a href={`/api/runs/${runId}/artifact/package_md`} download>
              <Button variant="outlined" size="sm">
                Download Markdown
              </Button>
            </a>
          ) : null}
          {hasPdf ? (
            <a href={`/api/runs/${runId}/artifact/package_pdf`} download>
              <Button variant="filled" size="sm">
                Download PDF
              </Button>
            </a>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      {/* Tabs */}
      <nav
        className="bg-surface/80 border-outline-variant/60 sticky top-[68px] z-10 flex items-center gap-1 overflow-x-auto border-b px-6 backdrop-blur md:px-10"
        aria-label="Package sections"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3 py-3 text-[13px] font-medium transition-colors ${
                active ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {t.label}
              {active ? (
                <span
                  aria-hidden
                  className="bg-primary absolute bottom-0 left-2 right-2 h-[2px] rounded-t"
                />
              ) : null}
            </button>
          );
        })}
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-8 md:px-10">
        {tab === "overview" && <OverviewTab pkg={pkg} totalCost={totalCost} />}
        {tab === "architecture" && <ArchitectureTab pkg={pkg} />}
        {tab === "system-design" && (
          <SystemDesignPane
            sequenceDiagrams={pkg.sequenceDiagrams}
            integrationContracts={pkg.integrationContracts}
            componentRationales={pkg.componentRationales}
            failureModes={pkg.failureModes}
            buildSequence={pkg.buildSequence}
            nodes={pkg.nodes}
            onCite={() => setTab("sources")}
          />
        )}
        {tab === "components" && <ComponentsTab pkg={pkg} totalCost={totalCost} />}
        {tab === "decisions" && <DecisionsTab pkg={pkg} />}
        {tab === "risks" && <RisksTab pkg={pkg} />}
        {tab === "sources" && <SourcesTab sources={pkg.sources} />}
      </main>

      <footer className="text-on-surface-variant border-outline-variant/60 mx-auto max-w-6xl border-t px-6 py-6 text-[11px] md:px-10">
        Generated by TESSAR — recommendations are starting points, not a substitute for security
        review or load testing. KB snapshot{" "}
        <code className="bg-surface-container rounded px-1 py-0.5">{pkg.kbSnapshotId}</code>.
      </footer>
    </div>
  );
}

// ─── Tab: Overview ──────────────────────────────────────────────

function OverviewTab({
  pkg,
  totalCost,
}: {
  pkg: RunPackage;
  totalCost: number;
}): React.ReactElement {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Brief" className="lg:col-span-2">
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{pkg.brief}</p>
      </Card>
      <Card title="At a glance">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Stat label="Components" value={String(pkg.nodes.length)} />
          <Stat label="Decisions" value={String(pkg.decisions.length)} />
          <Stat label="Risks" value={String(pkg.risks.length)} />
          <Stat label="Sources" value={String(pkg.sources.length)} />
          <Stat label="Est. monthly cost" value={fmtUsd(totalCost)} />
          <Stat label="Roadmap items" value={String(pkg.roadmap.length)} />
        </dl>
      </Card>

      {pkg.requirements.length ? (
        <Card title="Requirements" className="lg:col-span-2">
          <ul className="divide-outline-variant/60 divide-y">
            {pkg.requirements.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between py-2 text-[13px]">
                <span className="text-on-surface">{r.label}</span>
                <span className="text-on-surface-variant text-right">
                  {r.value} <span className="text-[10px] uppercase opacity-60">· {r.source}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {pkg.assumptions.length ? (
        <Card title="Assumptions">
          <ul className="space-y-2 text-[13px]">
            {pkg.assumptions.map((a) => (
              <li key={a.id} className="text-on-surface-variant">
                <span className="text-on-surface">{a.text}</span>
                {a.basis ? (
                  <span className="block text-[11px] opacity-70">based on: {a.basis}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {pkg.flowNarrative.length ? (
        <Card title="Request lifecycle" className="lg:col-span-3">
          <ol className="space-y-4">
            {pkg.flowNarrative.map((step, i) => (
              <FlowStepItem key={step.id} index={i + 1} step={step} />
            ))}
          </ol>
        </Card>
      ) : null}

      {pkg.roadmap.length ? (
        <Card title="Roadmap" className="lg:col-span-3">
          <ol className="space-y-3">
            {pkg.roadmap.map((r, i) => (
              <li key={r.id} className="flex gap-4">
                <span className="bg-primary-container text-on-primary-container grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] font-medium">
                    {r.title}{" "}
                    <span className="text-on-surface-variant text-[11px] font-normal">
                      · {r.when}
                    </span>
                  </p>
                  <p className="text-on-surface-variant text-[12px] leading-relaxed">{r.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}

// ─── Tab: Architecture ──────────────────────────────────────────

function ArchitectureTab({ pkg }: { pkg: RunPackage }): React.ReactElement {
  const [focus, setFocus] = useState<string | null>(null);
  const focused = pkg.nodes.find((n) => n.id === focus) ?? null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="System diagram" className="overflow-hidden">
        <ArchitectureDiagram nodes={pkg.nodes} edges={pkg.edges} focus={focus} onFocus={setFocus} />
        <p className="text-on-surface-variant mt-3 text-[11px]">
          {pkg.nodes.length} components · {pkg.edges.length} flows. Click a component to see its
          rationale.
        </p>
      </Card>
      <Card title={focused ? focused.label : "Component detail"}>
        {focused ? (
          <NodeDetail node={focused} sources={pkg.sources} />
        ) : (
          <p className="text-on-surface-variant text-[13px]">
            Select a component on the diagram to see why it was chosen, what it scales like at 1× /
            10× / 100×, and which alternatives were considered.
          </p>
        )}
      </Card>
    </div>
  );
}

const ZONE_COLORS: Record<Zone, string> = {
  client: "rgb(var(--md-sys-color-surface-container-high))",
  edge: "rgb(var(--md-sys-color-tertiary-container))",
  app: "rgb(var(--md-sys-color-primary-container))",
  data: "rgb(var(--md-sys-color-secondary-container))",
  external: "rgb(var(--md-sys-color-surface-container))",
};

const ZONE_LABELS: Record<Zone, string> = {
  client: "Client",
  edge: "Edge",
  app: "App",
  data: "Data",
  external: "External",
};

// Order zones top-to-bottom for the legend; reuses the same ordering the
// architect agent uses when placing nodes vertically.
const ZONE_ORDER: Zone[] = ["client", "edge", "app", "data", "external"];

export function ArchitectureDiagram({
  nodes,
  edges,
  focus,
  onFocus,
}: {
  nodes: ArchNode[];
  edges: ArchEdge[];
  focus: string | null;
  onFocus: (id: string | null) => void;
}): React.ReactElement {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Only show legend entries for zones actually present in this package.
  const presentZones = useMemo(() => {
    const set = new Set(nodes.map((n) => n.zone));
    return ZONE_ORDER.filter((z) => set.has(z));
  }, [nodes]);

  return (
    <div className="bg-surface-container-low w-full overflow-hidden rounded-xl">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
        style={{ minHeight: "560px", aspectRatio: "16 / 11" }}
        role="img"
        aria-label="Architecture diagram"
      >
        <defs>
          <marker
            id="pkg-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 z" fill="rgb(var(--md-sys-color-outline))" />
          </marker>
        </defs>

        {/* Edges first so nodes draw on top */}
        {edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const dashed = e.kind === "async" || e.kind === "data";
          const dim = focus !== null && focus !== e.from && focus !== e.to;
          return (
            <line
              key={`${e.from}-${e.to}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgb(var(--md-sys-color-outline))"
              strokeWidth={0.45}
              strokeDasharray={dashed ? "1.4 0.9" : undefined}
              opacity={dim ? 0.25 : 0.75}
              markerEnd="url(#pkg-arrow)"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const w = Math.max(n.w || 18, 17);
          const h = 11;
          const isFocus = focus === n.id;
          const dim = focus !== null && !isFocus;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x - w / 2}, ${n.y - h / 2})`}
              className="cursor-pointer"
              onClick={() => onFocus(isFocus ? null : n.id)}
              opacity={dim ? 0.55 : 1}
            >
              <rect
                x={0}
                y={0}
                width={w}
                height={h}
                rx={1.6}
                fill={ZONE_COLORS[n.zone] ?? "rgb(var(--md-sys-color-surface-container))"}
                stroke={
                  isFocus
                    ? "rgb(var(--md-sys-color-primary))"
                    : "rgb(var(--md-sys-color-outline-variant))"
                }
                strokeWidth={isFocus ? 0.7 : 0.25}
              />
              <text
                x={w / 2}
                y={h / 2 - 0.9}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={2.6}
                fontWeight={600}
                fill="rgb(var(--md-sys-color-on-surface))"
              >
                {n.label}
              </text>
              <text
                x={w / 2}
                y={h / 2 + 2.6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={1.8}
                fill="rgb(var(--md-sys-color-on-surface-variant))"
              >
                {truncate(n.sub, 34)}
              </text>
            </g>
          );
        })}

        {/* Zone legend, bottom-left */}
        {presentZones.map((z, i) => {
          const x = 1.5 + i * 13;
          const y = 96;
          return (
            <g key={z} transform={`translate(${x}, ${y})`}>
              <rect
                x={0}
                y={-1.8}
                width={2.2}
                height={2.2}
                rx={0.4}
                fill={ZONE_COLORS[z]}
                stroke="rgb(var(--md-sys-color-outline-variant))"
                strokeWidth={0.15}
              />
              <text
                x={3}
                y={0}
                fontSize={1.8}
                dominantBaseline="middle"
                fill="rgb(var(--md-sys-color-on-surface-variant))"
              >
                {ZONE_LABELS[z]}
              </text>
            </g>
          );
        })}

        {/* Edge-style legend, bottom-right */}
        <g transform="translate(78, 96)">
          <line
            x1={0}
            y1={-0.8}
            x2={4}
            y2={-0.8}
            stroke="rgb(var(--md-sys-color-outline))"
            strokeWidth={0.45}
            markerEnd="url(#pkg-arrow)"
          />
          <text
            x={5}
            y={0}
            fontSize={1.8}
            dominantBaseline="middle"
            fill="rgb(var(--md-sys-color-on-surface-variant))"
          >
            sync
          </text>
          <line
            x1={11}
            y1={-0.8}
            x2={15}
            y2={-0.8}
            stroke="rgb(var(--md-sys-color-outline))"
            strokeWidth={0.45}
            strokeDasharray="1.4 0.9"
            markerEnd="url(#pkg-arrow)"
          />
          <text
            x={16}
            y={0}
            fontSize={1.8}
            dominantBaseline="middle"
            fill="rgb(var(--md-sys-color-on-surface-variant))"
          >
            async / data
          </text>
        </g>
      </svg>
    </div>
  );
}

export function NodeDetail({
  node,
  sources,
}: {
  node: ArchNode;
  sources: Source[];
}): React.ReactElement {
  const cite = sources.find((s) => s.id === node.cite);
  return (
    <div className="space-y-4 text-[13px]">
      <div>
        <p className="text-on-surface-variant text-[11px] uppercase tracking-wide">{node.zone}</p>
        <p className="text-[14px] font-semibold">{node.sub}</p>
      </div>
      <p className="text-on-surface-variant leading-relaxed">{node.why}</p>

      {node.alts ? (
        <div>
          <p className="text-on-surface-variant text-[11px] uppercase tracking-wide">Considered</p>
          <p>{node.alts}</p>
        </div>
      ) : null}

      <div>
        <p className="text-on-surface-variant text-[11px] uppercase tracking-wide">Scale</p>
        <ul className="space-y-1">
          {node.scale.map((s) => (
            <li key={s.tier} className="flex gap-2">
              <span className="bg-surface-container w-9 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold">
                {s.tier}
              </span>
              <span className="text-on-surface-variant flex-1">{s.note}</span>
            </li>
          ))}
        </ul>
      </div>

      {cite ? (
        <div className="border-outline-variant/60 border-t pt-3 text-[11px]">
          <p className="text-on-surface-variant">Source [{cite.id}]</p>
          <a
            href={cite.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary truncate hover:underline"
          >
            {cite.title} <span className="text-on-surface-variant">· {cite.publisher}</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}

// ─── Tab: Components / BOM ──────────────────────────────────────

function ComponentsTab({
  pkg,
  totalCost,
}: {
  pkg: RunPackage;
  totalCost: number;
}): React.ReactElement {
  return (
    <div className="space-y-6">
      <Card title={`Bill of materials (${pkg.bom.length} lines · est. ${fmtUsd(totalCost)}/mo)`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="text-on-surface-variant text-[11px] uppercase">
              <tr className="border-outline-variant/60 border-b">
                <th className="py-2 pr-4">Component</th>
                <th className="py-2 pr-4">Kind</th>
                <th className="py-2 pr-4 text-right">Base / mo</th>
                <th className="py-2 pr-4">Notes</th>
                <th className="py-2 pr-4">Source</th>
              </tr>
            </thead>
            <tbody>
              {pkg.bom.map((l) => (
                <BomRow key={l.id} line={l} sources={pkg.sources} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-outline-variant/60 border-t font-semibold">
                <td colSpan={2} className="py-2 pr-4">
                  Estimated total
                </td>
                <td className="py-2 pr-4 text-right">{fmtUsd(totalCost)}</td>
                <td
                  colSpan={2}
                  className="text-on-surface-variant py-2 pr-4 text-[11px] font-normal"
                >
                  At brief baseline scale; multipliers apply as users / RPS / GB grow.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BomRow({ line, sources }: { line: BomLine; sources: Source[] }): React.ReactElement {
  const cite = sources.find((s) => s.id === line.cite);
  const notes: string[] = [];
  if (line.fixed) notes.push("fixed");
  if (line.freeTierPct) notes.push(`free tier covers ~${line.freeTierPct}%`);
  if (line.scaleExp?.users) notes.push(`scales with users^${line.scaleExp.users}`);
  if (line.scaleExp?.rps) notes.push(`scales with RPS^${line.scaleExp.rps}`);
  if (line.scaleExp?.gb) notes.push(`scales with storage^${line.scaleExp.gb}`);
  return (
    <tr className="border-outline-variant/40 border-b">
      <td className="py-2 pr-4 font-medium">{line.name}</td>
      <td className="py-2 pr-4">
        <span className="bg-surface-container rounded px-1.5 py-0.5 text-[11px]">{line.kind}</span>
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(line.baseCost)}</td>
      <td className="text-on-surface-variant py-2 pr-4 text-[11px]">{notes.join(" · ") || "—"}</td>
      <td className="py-2 pr-4 text-[11px]">
        {cite ? (
          <a
            href={cite.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            [{cite.id}] {cite.publisher}
          </a>
        ) : (
          <span className="text-on-surface-variant">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Tab: Decisions ─────────────────────────────────────────────

function DecisionsTab({ pkg }: { pkg: RunPackage }): React.ReactElement {
  return (
    <div className="grid gap-4">
      {pkg.decisions.map((d) => (
        <DecisionCard key={d.id} decision={d} sources={pkg.sources} />
      ))}
    </div>
  );
}

export function DecisionCard({
  decision,
  sources,
}: {
  decision: Decision;
  sources: Source[];
}): React.ReactElement {
  const cite = sources.find((s) => s.id === decision.cite);
  return (
    <div className="border-outline-variant/60 bg-surface-container-low rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-on-surface-variant text-[11px] uppercase tracking-wide">
            {decision.topic}
          </p>
          <h3 className="text-[16px] font-semibold">{decision.pick}</h3>
          <p className="text-on-surface-variant text-[12px]">{decision.vs}</p>
        </div>
        <ConfidencePill conf={decision.conf} />
      </div>
      <p className="text-on-surface mt-3 text-[13px] leading-relaxed">{decision.why}</p>
      <dl className="text-on-surface-variant mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        <div>
          <dt className="opacity-70">Reversibility</dt>
          <dd>{decision.reversibility}</dd>
        </div>
        <div>
          <dt className="opacity-70">Blast radius</dt>
          <dd>{decision.blastRadius}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="opacity-70">Revisit when</dt>
          <dd>{decision.revisitAt}</dd>
        </div>
      </dl>
      {cite ? (
        <p className="mt-3 text-[11px]">
          <a
            href={cite.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            [{cite.id}] {cite.title}{" "}
            <span className="text-on-surface-variant">· {cite.publisher}</span>
          </a>
        </p>
      ) : null}
    </div>
  );
}

// ─── Tab: Risks ─────────────────────────────────────────────────

function RisksTab({ pkg }: { pkg: RunPackage }): React.ReactElement {
  // Sort high severity first
  const sorted = useMemo(() => {
    const order: Record<string, number> = { high: 0, med: 1, low: 2 };
    return [...pkg.risks].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  }, [pkg.risks]);
  return (
    <div className="grid gap-4">
      {sorted.map((r) => (
        <RiskCard key={r.id} risk={r} sources={pkg.sources} />
      ))}
    </div>
  );
}

export function RiskCard({ risk, sources }: { risk: Risk; sources: Source[] }): React.ReactElement {
  const cite = sources.find((s) => s.id === risk.cite);
  const sevColor =
    risk.severity === "high"
      ? "bg-error-container text-on-error-container"
      : risk.severity === "med"
        ? "bg-tertiary-container text-on-tertiary-container"
        : "bg-surface-container text-on-surface-variant";
  return (
    <div className="border-outline-variant/60 bg-surface-container-low rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{risk.title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase ${sevColor}`}>
          {risk.severity} · likelihood {risk.likelihood}
        </span>
      </div>
      <p className="text-on-surface-variant mt-2 text-[13px] leading-relaxed">{risk.body}</p>
      <div className="bg-surface-container/60 mt-3 rounded-lg p-3 text-[12px]">
        <p className="text-on-surface-variant text-[10px] uppercase tracking-wide">Mitigation</p>
        <p>{risk.mitigation}</p>
      </div>
      {cite ? (
        <p className="mt-3 text-[11px]">
          <a
            href={cite.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            [{cite.id}] {cite.title}{" "}
            <span className="text-on-surface-variant">· {cite.publisher}</span>
          </a>
        </p>
      ) : null}
    </div>
  );
}

// ─── Tab: Sources ───────────────────────────────────────────────

function SourcesTab({ sources }: { sources: Source[] }): React.ReactElement {
  return (
    <Card title={`Sources (${sources.length})`}>
      <ol className="divide-outline-variant/60 divide-y">
        {sources.map((s) => (
          <li key={s.id} className="flex items-baseline gap-3 py-2 text-[13px]">
            <span className="text-on-surface-variant w-8 shrink-0 text-right tabular-nums">
              [{s.id}]
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary block truncate hover:underline"
              >
                {s.title}
              </a>
              <p className="text-on-surface-variant truncate text-[11px]">
                {s.publisher} · verified {s.verifiedAt.slice(0, 10)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ─── Reused primitives ──────────────────────────────────────────

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section
      className={`border-outline-variant/60 bg-surface-container-low rounded-2xl border p-5 ${className}`}
    >
      <h2 className="text-on-surface-variant mb-3 text-[11px] font-semibold uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <>
      <dt className="text-on-surface-variant text-[11px]">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </>
  );
}

function FlowStepItem({ index, step }: { index: number; step: FlowStep }): React.ReactElement {
  return (
    <li className="flex gap-4">
      <span className="bg-primary-container text-on-primary-container grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{step.title}</p>
        <p className="text-on-surface-variant mt-1 text-[12px] leading-relaxed">{step.body}</p>
        {step.nodes.length ? (
          <p className="text-on-surface-variant mt-1 text-[10px] uppercase tracking-wide opacity-80">
            touches: {step.nodes.join(" → ")}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
