"use client";

/**
 * <DecideViewer /> — the consumer-grade post-run reader.
 *
 * Five linear sections, one screen each, designed to be read top-to-bottom
 * in 3 minutes:
 *
 *   1. Verdict   — what we heard, the recommended stack asserted, diagram,
 *                  cost at scale, top risks. Print-friendly.
 *   2. Decisions — every pick + alternatives + why-not + citations.
 *   3. Numbers   — BOM table + scale projections + "what's missing"
 *                  cost-realism callout.
 *   4. Risks     — every risk + mitigation, sorted by severity.
 *   5. Audit     — KB snapshot, sources, generated-at, disclaimer.
 *
 * No lenses. No story view. No inspector overlays. Plain navigation.
 *
 * Design intent: the architect lands on Verdict, reads it cold, leaves
 * with a defensible recommendation. Everything else is drill-down.
 */

import Link from "next/link";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { ConfidencePill } from "@/components/ui/confidence-pill";
import {
  ArchitectureDiagram,
  DecisionCard,
  NodeDetail,
  RiskCard,
  fmtUsd,
} from "@/components/package/package-view";
import { SystemDesignPane } from "@/components/package/system-design-sections";
import {
  deriveExecutiveSummary,
  groupDecisionsByTier,
  mapRequirementsToArchitecture,
} from "@/lib/package-synthesis";
import type { ExecutiveSummary } from "@/lib/package-synthesis";
import type { ArchNode, BomLine, Decision, Risk, RunPackage } from "@/lib/run-package";

type Section = "verdict" | "system-design" | "decisions" | "numbers" | "risks" | "audit";

const SECTIONS: Array<{ id: Section; label: string; hint: string }> = [
  { id: "verdict", label: "Verdict", hint: "The answer in one screen" },
  { id: "system-design", label: "System design", hint: "How it fits & how it fails" },
  { id: "decisions", label: "Decisions", hint: "Every pick, every alternative" },
  { id: "numbers", label: "Numbers", hint: "Cost at 1× / 10× / 100×" },
  { id: "risks", label: "Risks", hint: "What can go wrong, what to do" },
  { id: "audit", label: "Audit", hint: "Sources, KB snapshot, prompts" },
];

interface Props {
  runId: string;
  pkg: RunPackage;
  hasMd: boolean;
  hasPdf: boolean;
  completedAt: string | null;
}

export function DecideViewer({
  runId,
  pkg,
  hasMd,
  hasPdf,
  completedAt,
}: Props): React.ReactElement {
  const [section, setSection] = useState<Section>("verdict");

  const briefTitle = useMemo(() => deriveBriefTitle(pkg.brief), [pkg.brief]);
  const completedLabel = useMemo(() => formatCompleted(completedAt), [completedAt]);

  return (
    <AppShell pageLabel="design package">
      <ActionBar
        runId={runId}
        title={briefTitle}
        completedLabel={completedLabel}
        hasMd={hasMd}
        hasPdf={hasPdf}
      />
      <Nav active={section} onChange={setSection} />

      <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-8 md:px-10">
        {section === "verdict" ? <VerdictSection pkg={pkg} /> : null}
        {section === "system-design" ? (
          <SystemDesignPane
            sequenceDiagrams={pkg.sequenceDiagrams}
            integrationContracts={pkg.integrationContracts}
            componentRationales={pkg.componentRationales}
            failureModes={pkg.failureModes}
            buildSequence={pkg.buildSequence}
            nodes={pkg.nodes}
            onCite={() => setSection("audit")}
          />
        ) : null}
        {section === "decisions" ? <DecisionsSection pkg={pkg} /> : null}
        {section === "numbers" ? <NumbersSection pkg={pkg} /> : null}
        {section === "risks" ? <RisksSection pkg={pkg} /> : null}
        {section === "audit" ? (
          <AuditSection pkg={pkg} runId={runId} completedLabel={completedLabel} />
        ) : null}
      </main>
    </AppShell>
  );
}

/* ─── Action bar & Nav ─────────────────────────────────────────── */

/**
 * Slim title strip that sits below the AppShell header and above the
 * section nav. Carries the brief title + completion metadata + export
 * actions. Sticky so the export buttons stay reachable as the reader
 * scrolls.
 */
function ActionBar({
  runId,
  title,
  completedLabel,
  hasMd,
  hasPdf,
}: {
  runId: string;
  title: string;
  completedLabel: string;
  hasMd: boolean;
  hasPdf: boolean;
}): React.ReactElement {
  return (
    <div className="border-outline-variant/60 bg-surface/85 sticky top-[57px] z-10 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 md:px-10">
        <div className="min-w-0">
          <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
            Design package · run #{runId.slice(0, 8)}
          </p>
          <h1 className="text-on-surface mt-0.5 truncate text-[18px] font-semibold leading-tight">
            {title}
          </h1>
          <p className="text-on-surface-variant truncate text-[11px]">Completed {completedLabel}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href={`/run/${runId}`}>
            <Button variant="text" size="sm">
              ← Back to run
            </Button>
          </Link>
          {hasMd ? (
            <a href={`/api/runs/${runId}/artifact/package_md`} download>
              <Button variant="outlined" size="sm">
                Markdown
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
        </div>
      </div>
    </div>
  );
}

function Nav({
  active,
  onChange,
}: {
  active: Section;
  onChange: (s: Section) => void;
}): React.ReactElement {
  return (
    <nav className="border-outline-variant/60 bg-surface-container-low/40 border-b">
      <div
        role="tablist"
        aria-label="Package sections"
        className="scrollbar-hide mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 md:px-8"
      >
        {SECTIONS.map((s) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(s.id)}
              className={[
                "relative flex shrink-0 flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors",
                isActive ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
              ].join(" ")}
            >
              <span className="text-[13px] font-semibold">{s.label}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-70">{s.hint}</span>
              {isActive ? (
                <span
                  aria-hidden
                  className="bg-primary absolute inset-x-2 bottom-0 h-[2px] rounded-full"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ─── 1. Verdict ─────────────────────────────────────────────── */

function VerdictSection({ pkg }: { pkg: RunPackage }): React.ReactElement {
  const [focus, setFocus] = useState<string | null>(null);
  const focused = useMemo(() => pkg.nodes.find((n) => n.id === focus) ?? null, [focus, pkg.nodes]);

  const stackPicks = useMemo(() => topStackPicks(pkg.decisions), [pkg.decisions]);
  const baselineCost = useMemo(() => sumBaseline(pkg.bom), [pkg.bom]);
  const scaledCost = useMemo(() => sumAtScale(pkg.bom, 10, 10, 10), [pkg.bom]);
  const topRisks = useMemo(() => sortRisks(pkg.risks).slice(0, 3), [pkg.risks]);
  const requirementsByKind = useMemo(() => groupRequirements(pkg.requirements), [pkg.requirements]);
  const summary = useMemo(() => deriveExecutiveSummary(pkg), [pkg]);
  const reqMap = useMemo(() => mapRequirementsToArchitecture(pkg), [pkg]);

  return (
    <div className="space-y-10">
      {/* Executive summary — the answer in one screen. */}
      <ExecutiveSummaryCard pkg={pkg} summary={summary} />

      {/* Brief echo */}
      <Block eyebrow="What we heard" title="Your brief, as we understood it">
        <p className="text-on-surface mb-5 max-w-3xl whitespace-pre-line text-[14px] leading-relaxed">
          {pkg.brief.trim()}
        </p>
        {requirementsByKind.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {requirementsByKind.map((g) => (
              <div
                key={g.label}
                className="border-outline-variant/60 bg-surface-container-low rounded-xl border p-4"
              >
                <p className="text-on-surface-variant mb-2 text-[10px] font-semibold uppercase tracking-wide">
                  {g.label}
                </p>
                <ul className="space-y-1.5 text-[13px]">
                  {g.items.map((r) => (
                    <li key={r.id} className="flex items-baseline gap-2">
                      <span className="bg-surface-container text-on-surface-variant rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        {r.label}
                      </span>
                      <span className="text-on-surface">{r.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </Block>

      {/* The verdict assertion */}
      <Block eyebrow="Our recommendation" title="Build it like this">
        <p className="text-on-surface max-w-3xl text-[16px] leading-relaxed">
          For this brief, your stack is{" "}
          {stackPicks.map((p, i) => (
            <span key={p.id}>
              <strong className="font-semibold">{p.pick}</strong>
              {i < stackPicks.length - 2 ? ", " : i === stackPicks.length - 2 ? " and " : "."}
            </span>
          ))}{" "}
          Expect <strong className="font-semibold">{fmtUsd(baselineCost)}/mo</strong> at your
          starting scale, scaling to roughly{" "}
          <strong className="font-semibold">{fmtUsd(scaledCost)}/mo</strong> at 10× users + RPS. The
          top risks to watch are listed below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          {stackPicks.map((p) => (
            <span
              key={p.id}
              className="border-outline-variant/60 bg-surface-container-low text-on-surface-variant rounded-full border px-3 py-1"
            >
              {p.topic} · <span className="text-on-surface font-medium">{p.pick}</span>
            </span>
          ))}
        </div>
      </Block>

      {/* The diagram */}
      <Block eyebrow="The architecture" title="How the pieces fit">
        <div className="space-y-4">
          <div>
            <ArchitectureDiagram
              nodes={pkg.nodes}
              edges={pkg.edges}
              focus={focus}
              onFocus={setFocus}
            />
            <p className="text-on-surface-variant mt-2 text-[12px]">
              Click any component for the why, scaling notes, and alternatives considered.
            </p>
          </div>
          <div className="border-outline-variant/60 bg-surface-container-low min-h-[160px] rounded-xl border p-5">
            {focused ? (
              <NodeDetail node={focused} sources={pkg.sources} />
            ) : (
              <div className="text-on-surface-variant text-[13px]">
                <p className="mb-2 font-medium">
                  {pkg.nodes.length} components, {pkg.edges.length} connections
                </p>
                <p className="leading-relaxed">
                  Click any box above to see why it was chosen, what it costs at scale, and what
                  alternatives we considered.
                </p>
              </div>
            )}
          </div>
        </div>
      </Block>

      {/* Requirements → Architecture map */}
      {reqMap.some((m) => m.rationales.length > 0) ? (
        <Block eyebrow="Why this fits your brief" title="Requirements mapped to architecture">
          <p className="text-on-surface-variant mb-5 max-w-2xl text-[13px] leading-relaxed">
            Every requirement you stated (or that we inferred) is satisfied by one or more
            components. Each row is one requirement and the specific picks that address it, with the
            rationale inline.
          </p>
          <ul className="divide-outline-variant/60 divide-y">
            {reqMap.map(({ requirement, rationales }) => (
              <li key={requirement.id} className="grid gap-4 py-4 md:grid-cols-[260px_1fr]">
                <div>
                  <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
                    {requirement.label}
                  </p>
                  <p className="text-on-surface mt-1 text-[14px] font-medium leading-snug">
                    {requirement.value}
                  </p>
                  <p className="text-on-surface-variant mt-1 text-[10.5px] uppercase tracking-wide">
                    from {requirement.source}
                  </p>
                </div>
                {rationales.length ? (
                  <ul className="space-y-3">
                    {rationales.map(({ rationale, nodeLabel, nodeSub }) => (
                      <li
                        key={`${rationale.nodeId}-${rationale.requirementId}`}
                        className="border-outline-variant/60 bg-surface-container-low rounded-xl border p-4"
                      >
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="bg-primary-container/60 text-on-primary-container rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                            {nodeLabel}
                          </span>
                          {nodeSub ? (
                            <span className="text-on-surface-variant text-[11px]">{nodeSub}</span>
                          ) : null}
                          <span className="text-on-surface-variant ml-auto text-[10px] uppercase tracking-wide">
                            [{rationale.cite}]
                          </span>
                        </div>
                        <p className="text-on-surface mt-2 text-[13px] leading-relaxed">
                          {rationale.narrative}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-on-surface-variant text-[12.5px] italic">
                    No explicit component rationale was emitted for this requirement. See the
                    architecture diagram and decisions tab.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      {topRisks.length ? (
        <Block
          eyebrow="Watch out for"
          title={`The top ${topRisks.length} risk${topRisks.length === 1 ? "" : "s"}`}
        >
          <ul className="grid gap-3 md:grid-cols-3">
            {topRisks.map((r) => (
              <li
                key={r.id}
                className="border-outline-variant/60 bg-surface-container-low rounded-xl border p-4"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <SeverityDot severity={r.severity} />
                  <span className="text-on-surface-variant text-[10px] uppercase tracking-wide">
                    {r.severity} · likelihood {r.likelihood}
                  </span>
                </div>
                <p className="text-on-surface text-[13px] font-medium leading-snug">{r.title}</p>
                <p className="text-on-surface-variant mt-1 line-clamp-3 text-[12px] leading-relaxed">
                  {r.body}
                </p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}

/* ─── 2. Decisions ────────────────────────────────────────────── */

function DecisionsSection({ pkg }: { pkg: RunPackage }): React.ReactElement {
  const [sortMode, setSortMode] = useState<"tier" | "order" | "confidence" | "blast">("tier");

  const sorted = useMemo(
    () => (sortMode === "tier" ? pkg.decisions : sortDecisions(pkg.decisions, sortMode)),
    [pkg.decisions, sortMode],
  );
  const tiers = useMemo(() => groupDecisionsByTier(pkg.decisions), [pkg.decisions]);

  return (
    <div className="space-y-6">
      <Block
        eyebrow="Every pick, every alternative"
        title={`${pkg.decisions.length} decisions made`}
      >
        <p className="text-on-surface-variant max-w-2xl text-[13px] leading-relaxed">
          Each entry shows what we picked, what we considered instead, why we rejected the
          alternatives, the confidence level, and one citation. Reversibility tells you whether this
          pick is hard to change later.
        </p>
        <div className="mt-4 flex items-center gap-2 text-[12px]">
          <span className="text-on-surface-variant">Sort by</span>
          {(["tier", "order", "confidence", "blast"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              className={[
                "rounded-full px-3 py-1 transition-colors",
                sortMode === m
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-low text-on-surface-variant hover:text-on-surface",
              ].join(" ")}
            >
              {m === "tier"
                ? "Foundational first"
                : m === "order"
                  ? "Run order"
                  : m === "confidence"
                    ? "Confidence"
                    : "Blast radius"}
            </button>
          ))}
        </div>
      </Block>

      {sortMode === "tier" ? (
        <div className="space-y-8">
          <DecisionTier
            label="Foundational"
            hint="Hard-to-reverse picks that shape everything downstream. Change carefully."
            count={tiers.foundational.length}
            decisions={tiers.foundational}
            sources={pkg.sources}
          />
          <DecisionTier
            label="Dependent"
            hint="Picks that follow from the foundation. Easier to swap later."
            count={tiers.dependent.length}
            decisions={tiers.dependent}
            sources={pkg.sources}
          />
        </div>
      ) : (
        <div className="grid gap-4">
          {sorted.map((d) => (
            <DecisionCard key={d.id} decision={d} sources={pkg.sources} />
          ))}
        </div>
      )}
    </div>
  );
}

function DecisionTier({
  label,
  hint,
  count,
  decisions,
  sources,
}: {
  label: string;
  hint: string;
  count: number;
  decisions: Decision[];
  sources: RunPackage["sources"];
}): React.ReactElement | null {
  if (!count) return null;
  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.14em]">
            {label} · {count}
          </p>
          <p className="text-on-surface-variant text-[12.5px] leading-snug">{hint}</p>
        </div>
      </header>
      <div className="grid gap-4">
        {decisions.map((d) => (
          <DecisionCard key={d.id} decision={d} sources={sources} />
        ))}
      </div>
    </section>
  );
}

/* ─── 3. Numbers ──────────────────────────────────────────────── */

function NumbersSection({ pkg }: { pkg: RunPackage }): React.ReactElement {
  const baseline = useMemo(() => sumBaseline(pkg.bom), [pkg.bom]);
  const at10x = useMemo(() => sumAtScale(pkg.bom, 10, 10, 10), [pkg.bom]);
  const at100x = useMemo(() => sumAtScale(pkg.bom, 100, 100, 100), [pkg.bom]);

  const sortedLines = useMemo(
    () => [...pkg.bom].sort((a, b) => (b.baseCost || 0) - (a.baseCost || 0)),
    [pkg.bom],
  );

  const missingLikelyItems = useMemo(() => detectMissingItems(pkg.bom), [pkg.bom]);

  return (
    <div className="space-y-6">
      <Block eyebrow="What it costs" title={`${fmtUsd(baseline)}/mo at your starting scale`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <CostTier label="1× (today)" cost={baseline} highlight />
          <CostTier label="10× users + RPS" cost={at10x} />
          <CostTier label="100× users + RPS" cost={at100x} />
        </div>
        <p className="text-on-surface-variant mt-3 max-w-2xl text-[12px] leading-relaxed">
          Scale projections multiply each line by its scaling exponent. Fixed costs (KMS, Secret
          Manager) stay constant. These are GCP list prices at the time of the KB snapshot — see
          Audit for dates. They don&apos;t include support contracts or sustained-use discounts.
        </p>
      </Block>

      {missingLikelyItems.length ? (
        <Block eyebrow="Reality check" title="Likely missing from this estimate">
          <p className="text-on-surface-variant mb-3 max-w-2xl text-[13px] leading-relaxed">
            The cost estimator only prices what the architect explicitly decided on. The following
            services are commonly part of a production GCP deployment but weren&apos;t assigned a
            cost line in this package:
          </p>
          <ul className="space-y-2 text-[13px]">
            {missingLikelyItems.map((item) => (
              <li
                key={item.label}
                className="border-outline-variant/60 bg-surface-container-low flex items-start gap-3 rounded-lg border p-3"
              >
                <span
                  aria-hidden
                  className="bg-tertiary-container text-on-tertiary-container mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                >
                  !
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-on-surface-variant text-[12px] leading-relaxed">{item.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block eyebrow="Bill of materials" title={`${pkg.bom.length} priced services`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-on-surface-variant border-outline-variant/60 border-b text-left text-[11px] uppercase tracking-wide">
                <th className="py-2 pr-4 font-semibold">Service</th>
                <th className="py-2 pr-4 font-semibold">Kind</th>
                <th className="py-2 pr-4 font-semibold">Scaling</th>
                <th className="py-2 pr-4 text-right font-semibold">Baseline</th>
                <th className="py-2 pr-4 text-right font-semibold">At 10×</th>
                <th className="py-2 text-right font-semibold">% of total</th>
              </tr>
            </thead>
            <tbody className="divide-outline-variant/40 divide-y">
              {sortedLines.map((line) => {
                const at10 = scaleLine(line, 10, 10, 10);
                const pct = baseline > 0 ? ((line.baseCost || 0) / baseline) * 100 : 0;
                return (
                  <tr key={line.id} className="text-on-surface">
                    <td className="py-3 pr-4 font-medium">{line.name}</td>
                    <td className="py-3 pr-4">
                      <KindChip kind={line.kind} fixed={line.fixed} />
                    </td>
                    <td className="py-3 pr-4 text-[12px] tabular-nums opacity-80">
                      {scaleSummary(line)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{fmtUsd(line.baseCost)}</td>
                    <td className="text-on-surface-variant py-3 pr-4 text-right tabular-nums">
                      {fmtUsd(at10)}
                    </td>
                    <td className="text-on-surface-variant py-3 text-right tabular-nums">
                      {pct.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-outline-variant/60 border-t font-semibold">
                <td className="py-3 pr-4">Total</td>
                <td colSpan={2}></td>
                <td className="py-3 pr-4 text-right tabular-nums">{fmtUsd(baseline)}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{fmtUsd(at10x)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Block>
    </div>
  );
}

function CostTier({
  label,
  cost,
  highlight = false,
}: {
  label: string;
  cost: number;
  highlight?: boolean;
}): React.ReactElement {
  return (
    <div
      className={[
        "rounded-xl border p-4",
        highlight
          ? "border-primary/40 bg-primary-container/40"
          : "border-outline-variant/60 bg-surface-container-low",
      ].join(" ")}
    >
      <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wide">
        {label}
      </p>
      <p className="text-on-surface mt-1 text-[24px] font-semibold tabular-nums">{fmtUsd(cost)}</p>
      <p className="text-on-surface-variant text-[11px]">per month</p>
    </div>
  );
}

function KindChip({ kind, fixed }: { kind: BomLine["kind"]; fixed?: boolean }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="bg-surface-container text-on-surface-variant rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
        {kind}
      </span>
      {fixed ? (
        <span className="bg-tertiary-container text-on-tertiary-container rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          fixed
        </span>
      ) : null}
    </span>
  );
}

/* ─── 4. Risks ────────────────────────────────────────────────── */

function RisksSection({ pkg }: { pkg: RunPackage }): React.ReactElement {
  const sorted = useMemo(() => sortRisks(pkg.risks), [pkg.risks]);
  return (
    <div className="space-y-6">
      <Block eyebrow="What can go wrong" title={`${pkg.risks.length} risks identified`}>
        <p className="text-on-surface-variant max-w-2xl text-[13px] leading-relaxed">
          Sorted highest severity and likelihood first. Each entry has a concrete mitigation — if a
          mitigation reads vague, treat that as a signal that the risk needs more thought before you
          commit.
        </p>
      </Block>
      <div className="grid gap-4">
        {sorted.map((r) => (
          <RiskCard key={r.id} risk={r} sources={pkg.sources} />
        ))}
      </div>
    </div>
  );
}

function SeverityDot({ severity }: { severity: Risk["severity"] }): React.ReactElement {
  const color =
    severity === "high" ? "bg-error" : severity === "med" ? "bg-tertiary" : "bg-outline-variant";
  return <span aria-hidden className={`size-2 rounded-full ${color}`} />;
}

/* ─── 5. Audit ────────────────────────────────────────────────── */

function AuditSection({
  pkg,
  runId,
  completedLabel,
}: {
  pkg: RunPackage;
  runId: string;
  completedLabel: string;
}): React.ReactElement {
  return (
    <div className="space-y-6">
      <Block eyebrow="Provenance" title="Where this came from">
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <Field label="Run ID" value={runId} mono />
          <Field label="Completed at" value={completedLabel} />
          <Field label="KB snapshot" value={pkg.kbSnapshotId} mono />
          <Field label="Generated at" value={pkg.generatedAt} />
          <Field label="Sources cited" value={String(pkg.sources.length)} />
          <Field label="Decisions made" value={String(pkg.decisions.length)} />
        </dl>
      </Block>

      {pkg.assumptions.length ? (
        <Block
          eyebrow="Assumptions"
          title={`${pkg.assumptions.length} assumptions made on your behalf`}
        >
          <p className="text-on-surface-variant mb-3 max-w-2xl text-[13px] leading-relaxed">
            Where the brief was silent, we inferred. Re-run with these stated explicitly to
            override.
          </p>
          <ul className="space-y-3">
            {pkg.assumptions.map((a) => (
              <li
                key={a.id}
                className="border-outline-variant/60 bg-surface-container-low rounded-xl border p-4 text-[13px]"
              >
                <p className="text-on-surface font-medium">{a.text}</p>
                <p className="text-on-surface-variant mt-1 text-[12px] leading-relaxed">
                  {a.basis}
                </p>
                {a.override ? (
                  <p className="text-on-surface-variant mt-2 text-[11px]">
                    <span className="opacity-70">To override: </span>
                    <span>{a.override}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block eyebrow="Sources" title={`${pkg.sources.length} sources cited`}>
        <ol className="divide-outline-variant/60 divide-y">
          {pkg.sources.map((s) => (
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
      </Block>

      <Block eyebrow="Disclaimer" title="What this is and isn't">
        <p className="text-on-surface-variant max-w-2xl text-[13px] leading-relaxed">
          This package is a researched starting point, not a final architecture. It reflects the
          knowledge in our KB at snapshot time and the brief as we understood it. Costs are list
          prices and don&apos;t include support contracts, sustained-use discounts, or your
          organisation&apos;s negotiated rates. Validate every recommendation against your
          team&apos;s operational constraints before committing.
        </p>
      </Block>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div className="border-outline-variant/60 bg-surface-container-low rounded-lg border p-3">
      <dt className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wide">
        {label}
      </dt>
      <dd
        className={["text-on-surface mt-1 break-all text-[13px]", mono ? "font-mono" : ""].join(
          " ",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ─── Shared block scaffold ───────────────────────────────────── */

function Block({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section>
      <header className="mb-4">
        <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.12em]">
          {eyebrow}
        </p>
        <h2 className="text-on-surface text-[22px] font-semibold leading-tight">{title}</h2>
      </header>
      {children}
    </section>
  );
}

/* ─── Executive Summary ──────────────────────────────────────── */

/**
 * The "answer in one screen" — sits at the very top of Verdict.
 *
 * Synthesises:
 *   - one-line brief title
 *   - up-to-5 headline picks as chips (each tied to its "why")
 *   - baseline + 10× cost + top cost driver
 *   - top risk
 *   - first 3 build phases
 *
 * Intentionally denser typography than the rest of the page: this is the
 * thing the reader trusts first. Everything below is drill-down.
 */
function ExecutiveSummaryCard({
  pkg,
  summary,
}: {
  pkg: RunPackage;
  summary: ExecutiveSummary;
}): React.ReactElement {
  const { picks, phases, baseline, scaled10x, costDriver, risk } = summary;
  // Index rationales by their target node so each headline pick can carry a
  // one-line "fits because" caption when the architect emitted one.
  const rationaleByNode = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of pkg.componentRationales) {
      if (!m.has(r.nodeId)) m.set(r.nodeId, r.narrative);
    }
    return m;
  }, [pkg.componentRationales]);

  const nodeByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of pkg.nodes) m.set(n.label.toLowerCase(), n.id);
    return m;
  }, [pkg.nodes]);

  return (
    <section
      aria-label="Executive summary"
      className="border-outline-variant/60 bg-surface-container-low/70 relative overflow-hidden rounded-3xl border p-6 shadow-[0_30px_80px_-50px_rgb(0_0_0/0.35)] md:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "rgb(var(--md-sys-color-primary) / 0.18)" }}
      />
      <div className="relative">
        <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
          Executive summary
        </p>
        <h2 className="text-on-surface mt-2 max-w-3xl text-[26px] font-semibold leading-[1.2] md:text-[30px]">
          {pickHeadline(pkg.brief)}
        </h2>

        {/* The shape: picks with one-line rationale each. */}
        {picks.length ? (
          <div className="mt-7">
            <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
              The shape
            </p>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {picks.map((p) => {
                const nodeId = nodeByLabel.get(p.pick.toLowerCase());
                const fits = (nodeId && rationaleByNode.get(nodeId)) || p.why;
                return (
                  <li
                    key={p.id}
                    className="border-outline-variant/50 bg-surface/70 flex items-start gap-3 rounded-xl border px-3.5 py-3"
                  >
                    <span
                      aria-hidden
                      className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-on-surface-variant text-[10.5px] font-semibold uppercase tracking-wide">
                          {p.topic}
                        </span>
                        <span className="text-on-surface text-[14px] font-semibold">{p.pick}</span>
                      </div>
                      <p className="text-on-surface-variant mt-1 line-clamp-2 text-[12px] leading-snug">
                        {fits}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* Stat row: baseline, scaled, top risk. */}
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <SummaryStat
            label="Cost · today"
            value={fmtUsd(baseline)}
            sub="per month, list price"
            highlight
          />
          <SummaryStat
            label="At 10× scale"
            value={fmtUsd(scaled10x)}
            sub={costDriver ? `driver: ${costDriver.name}` : "per month"}
          />
          <SummaryStat
            label="Top risk"
            value={risk?.title ?? "—"}
            sub={
              risk
                ? `${risk.severity} severity · ${risk.likelihood} likelihood`
                : "no risks flagged"
            }
          />
        </div>

        {/* Build order. */}
        {phases.length ? (
          <div className="mt-7">
            <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
              Build it in this order
            </p>
            <ol className="mt-3 grid gap-2.5 md:grid-cols-3">
              {phases.map((ph, i) => (
                <li
                  key={ph.id}
                  className="border-outline-variant/50 bg-surface/70 rounded-xl border px-3.5 py-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="bg-primary-container text-on-primary-container grid size-5 place-items-center rounded-full text-[10px] font-bold">
                      {i + 1}
                    </span>
                    <span className="text-on-surface-variant text-[10px] uppercase tracking-wide">
                      {ph.label}
                    </span>
                  </div>
                  <p className="text-on-surface mt-1.5 text-[13px] font-semibold leading-snug">
                    {ph.title}
                  </p>
                  <p className="text-on-surface-variant mt-1 line-clamp-2 text-[11.5px] leading-snug">
                    {ph.rationale}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}): React.ReactElement {
  return (
    <div
      className={[
        "rounded-xl border px-4 py-3",
        highlight
          ? "border-primary/40 bg-primary-container/40"
          : "border-outline-variant/50 bg-surface/70",
      ].join(" ")}
    >
      <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
        {label}
      </p>
      <p className="text-on-surface mt-1 truncate text-[18px] font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-on-surface-variant truncate text-[11px]">{sub}</p>
    </div>
  );
}

function pickHeadline(brief: string): string {
  const cleaned = brief.trim().replace(/\s+/g, " ");
  if (!cleaned) return "Your researched architecture, in one screen.";
  if (cleaned.length <= 180) return cleaned;
  return cleaned.slice(0, 177) + "…";
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function deriveBriefTitle(brief: string): string {
  const firstLine =
    brief
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "Untitled run";
  return firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine;
}

function formatCompleted(completedAt: string | null): string {
  if (!completedAt) return "Just now";
  try {
    return new Date(completedAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return completedAt;
  }
}

function topStackPicks(decisions: Decision[]): Decision[] {
  // Pick the up-to-4 most decisive picks as the headline stack:
  // prefer high-confidence, irreversible choices first.
  const order: Record<string, number> = { high: 0, med: 1, low: 2 };
  const reversibilityOrder: Record<string, number> = { "1-way": 0, "2-way": 1 };
  return [...decisions]
    .sort((a, b) => {
      const c = (order[a.conf] ?? 9) - (order[b.conf] ?? 9);
      if (c !== 0) return c;
      return (
        (reversibilityOrder[a.reversibility] ?? 9) - (reversibilityOrder[b.reversibility] ?? 9)
      );
    })
    .slice(0, 4);
}

function sortDecisions(decisions: Decision[], mode: "order" | "confidence" | "blast"): Decision[] {
  if (mode === "order") return decisions;
  const confOrder: Record<string, number> = { high: 0, med: 1, low: 2 };
  const blastOrder: Record<string, number> = { platform: 0, data: 1, service: 2 };
  return [...decisions].sort((a, b) => {
    if (mode === "confidence") return (confOrder[a.conf] ?? 9) - (confOrder[b.conf] ?? 9);
    return (blastOrder[a.blastRadius] ?? 9) - (blastOrder[b.blastRadius] ?? 9);
  });
}

function sortRisks(risks: Risk[]): Risk[] {
  const order: Record<string, number> = { high: 0, med: 1, low: 2 };
  return [...risks].sort((a, b) => {
    const sev = (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    if (sev !== 0) return sev;
    return (order[a.likelihood] ?? 9) - (order[b.likelihood] ?? 9);
  });
}

function sumBaseline(bom: BomLine[]): number {
  return bom.reduce((sum, l) => sum + (l.baseCost || 0), 0);
}

function sumAtScale(bom: BomLine[], usersMul: number, rpsMul: number, gbMul: number): number {
  return bom.reduce((sum, l) => sum + scaleLine(l, usersMul, rpsMul, gbMul), 0);
}

function scaleLine(line: BomLine, usersMul: number, rpsMul: number, gbMul: number): number {
  if (line.fixed) return line.baseCost || 0;
  const exp = line.scaleExp ?? {};
  const factor =
    Math.pow(usersMul, exp.users ?? 0) *
    Math.pow(rpsMul, exp.rps ?? 0) *
    Math.pow(gbMul, exp.gb ?? 0);
  return (line.baseCost || 0) * factor;
}

function scaleSummary(line: BomLine): string {
  if (line.fixed) return "fixed";
  const exp = line.scaleExp ?? {};
  const parts: string[] = [];
  if (exp.users) parts.push(`users^${exp.users}`);
  if (exp.rps) parts.push(`rps^${exp.rps}`);
  if (exp.gb) parts.push(`gb^${exp.gb}`);
  return parts.length ? parts.join(" · ") : "—";
}

function groupRequirements(
  reqs: RunPackage["requirements"],
): Array<{ label: string; items: RunPackage["requirements"] }> {
  if (!reqs.length) return [];
  // Group on the first word of `label` for a coarse but readable bucket.
  // (The orchestrator's Requirement type is loose at MVP — the labels are
  // free-form.)
  const buckets = new Map<string, RunPackage["requirements"]>();
  for (const r of reqs) {
    const key = (r.label || "").split(/\s|[·:]/)[0] || "Other";
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    if (!buckets.has(cap)) buckets.set(cap, []);
    buckets.get(cap)!.push(r);
  }
  // Cap the number of buckets to 6, and within each bucket cap items to 8.
  return Array.from(buckets.entries())
    .slice(0, 6)
    .map(([label, items]) => ({ label, items: items.slice(0, 8) }));
}

/**
 * Heuristic "what's missing from this BOM" detector.
 *
 * The cost_estimator only prices what the architect decided on; common
 * operational services (LB, NAT, egress, logging) often slip through. We
 * flag the obvious ones so the user sees a realistic floor — not a
 * pretend-cheap estimate.
 *
 * Pure UI hint, no claim of completeness.
 */
function detectMissingItems(bom: BomLine[]): Array<{ label: string; note: string }> {
  const names = bom.map((l) => l.name.toLowerCase());
  const has = (...needles: string[]): boolean =>
    needles.some((n) => names.some((name) => name.includes(n)));

  const missing: Array<{ label: string; note: string }> = [];

  if (!has("load balancer", "lb ", "global lb", "https lb")) {
    missing.push({
      label: "Global HTTPS Load Balancer",
      note: "~$22/mo base + per-GB. Required if you want a custom domain + Cloud Armor.",
    });
  }
  if (!has("nat", "cloud nat")) {
    missing.push({
      label: "Cloud NAT (egress for private services)",
      note: "~$32/mo per gateway. Needed when Cloud Run reaches the internet from a private VPC.",
    });
  }
  if (!has("egress", "network bandwidth", "internet egress")) {
    missing.push({
      label: "Internet egress",
      note: "Variable, $0.085–0.12/GiB after 1 GiB free per month. Easy $5–30/mo at small scale.",
    });
  }
  if (!has("logging", "cloud logging", "log analytics")) {
    missing.push({
      label: "Cloud Logging beyond free tier",
      note: "First 50 GiB/project/mo free, then $0.50/GiB. Often $5–30/mo with default verbosity.",
    });
  }
  if (!has("artifact registry", "container registry")) {
    missing.push({
      label: "Artifact Registry storage",
      note: "$0.10/GB stored. Small but non-zero once you have a few images cached.",
    });
  }

  return missing;
}
