"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfidencePill } from "@/components/ui/confidence-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArchitectureDiagram,
  DecisionCard,
  NodeDetail,
  RiskCard,
  fmtUsd,
} from "@/components/package/package-view";
import { springs } from "@/lib/motion/springs";
import type { RunPackage } from "@/lib/run-package";

/* ---------------------------------------------------------------------------
 * <DecideWorkspace /> — The post-completion workspace for a real run.
 *
 * Single viewport on lg+, three columns + bottom action bar:
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ ✓ TESSAR  · brief title · run #abc · downloads · theme              │
 *   ├─────────────┬───────────────────────────────────┬───────────────────┤
 *   │  BRIEF      │    LIVE ARCHITECTURE              │   DECISIONS       │
 *   │  + reqs     │    diagram (real pkg.nodes)       │   confidence pills│
 *   │  + assumpns │    NodeDetail slides over         │   + top risks     │
 *   │  (left)     │    on click                       │   (right)         │
 *   ├─────────────┴───────────────────────────────────┴───────────────────┤
 *   │ phase chips · total cost · sources · MD/PDF download · KB snapshot  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 *   Below the workspace (scrollable on smaller screens), expandable
 *   sections drill into BOM, full risks, sources, roadmap.
 *
 *   This is the data-driven counterpart to /decide (the demo prototype).
 *   `/decide` stays as the canned design-system playback; `/decide/[id]`
 *   renders this component against a real `RunPackage`.
 * ------------------------------------------------------------------------- */

const expressiveDefault = springs.expressiveDefault;

interface Props {
  runId: string;
  pkg: RunPackage;
  hasMd: boolean;
  hasPdf: boolean;
  completedAt: string | null;
}

const PHASES = [
  "Intake",
  "Requirements",
  "Research plan",
  "Research workers",
  "Synthesiser",
  "Architect",
  "Cost",
  "Risk",
  "Packager",
];

export function DecideWorkspace({
  runId,
  pkg,
  hasMd,
  hasPdf,
  completedAt,
}: Props): React.ReactElement {
  const [focus, setFocus] = useState<string | null>(null);
  const focused = useMemo(() => pkg.nodes.find((n) => n.id === focus) ?? null, [focus, pkg.nodes]);

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

  const topRisks = useMemo(() => {
    const order: Record<string, number> = { high: 0, med: 1, low: 2 };
    return [...pkg.risks]
      .sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
      .slice(0, 3);
  }, [pkg.risks]);

  return (
    <div className="bg-surface text-on-surface relative min-h-dvh w-full">
      {/* Brand wash + soft grid — matches /decide and /run/[id] */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 88% 12%, rgb(var(--md-sys-color-primary) / 0.10), transparent 70%), radial-gradient(50% 40% at 10% 92%, rgb(var(--md-sys-color-primary) / 0.06), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--md-sys-color-on-surface)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--md-sys-color-on-surface)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      {/* Header */}
      <header
        className="border-outline-variant/60 bg-surface/80 sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 backdrop-blur md:px-10"
        aria-label="Run package header"
      >
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
              ← Run progress
            </Button>
          </Link>
          {hasMd ? (
            <a href={`/api/runs/${runId}/artifact/package_md`} download>
              <Button variant="outlined" size="sm">
                MD
              </Button>
            </a>
          ) : null}
          {hasPdf ? (
            <a href={`/api/runs/${runId}/artifact/package_pdf`} download>
              <Button variant="filled" size="sm">
                PDF
              </Button>
            </a>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      {/* Workspace — 3 columns on lg, stacked below */}
      <main className="relative grid gap-4 px-6 py-5 md:px-10 lg:grid-cols-[280px_1fr_340px]">
        {/* LEFT — brief + requirements + assumptions */}
        <aside className="flex min-h-0 flex-col gap-3">
          <SectionCard title="Brief">
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{pkg.brief}</p>
          </SectionCard>
          {pkg.requirements.length ? (
            <SectionCard title={`Requirements · ${pkg.requirements.length}`}>
              <ul className="divide-outline-variant/60 divide-y">
                {pkg.requirements.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-baseline justify-between gap-2 py-1.5 text-[12px]"
                  >
                    <span className="text-on-surface min-w-0 truncate">{r.label}</span>
                    <span className="text-on-surface-variant shrink-0 text-right">
                      {r.value}
                      <span className="ml-1 text-[10px] uppercase opacity-60">{r.source}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
          {pkg.assumptions.length ? (
            <SectionCard title={`Assumptions · ${pkg.assumptions.length}`}>
              <ul className="space-y-1.5 text-[12px]">
                {pkg.assumptions.slice(0, 5).map((a) => (
                  <li key={a.id} className="text-on-surface-variant">
                    <span className="text-on-surface">{a.text}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </aside>

        {/* CENTER — architecture + (focused) detail */}
        <section className="flex min-h-0 flex-col gap-3">
          <SectionCard
            title={`Architecture · ${pkg.nodes.length} components · ${pkg.edges.length} flows`}
            className="overflow-hidden"
          >
            <ArchitectureDiagram
              nodes={pkg.nodes}
              edges={pkg.edges}
              focus={focus}
              onFocus={setFocus}
            />
            <p className="text-on-surface-variant mt-2 text-[10.5px]">
              Click a component to see why it was picked, scale notes, and the alternatives
              considered.
            </p>
          </SectionCard>

          <AnimatePresence initial={false}>
            {focused ? (
              <motion.div
                key={focused.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={expressiveDefault}
              >
                <SectionCard title={focused.label}>
                  <NodeDetail node={focused} sources={pkg.sources} />
                </SectionCard>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {/* RIGHT — decisions + top risks */}
        <aside className="flex min-h-0 flex-col gap-3">
          <SectionCard title={`Decisions · ${pkg.decisions.length}`}>
            <ul className="space-y-2">
              {pkg.decisions.map((d) => (
                <li
                  key={d.id}
                  className="border-outline-variant/60 bg-surface rounded-lg border px-2.5 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                      {d.topic}
                    </span>
                    <ConfidencePill conf={d.conf} />
                  </div>
                  <p className="text-primary mt-0.5 text-[12px] font-semibold leading-snug">
                    {d.pick}
                  </p>
                  <p className="text-on-surface-variant mt-1 line-clamp-2 text-[11px] leading-snug">
                    {d.why}
                  </p>
                </li>
              ))}
              {pkg.decisions.length === 0 ? (
                <li className="border-outline-variant text-on-surface-variant rounded-lg border border-dashed px-2.5 py-3 text-center text-[10.5px]">
                  No decisions emitted on this run.
                </li>
              ) : null}
            </ul>
          </SectionCard>

          {topRisks.length ? (
            <SectionCard title={`Top risks · ${pkg.risks.length}`}>
              <ul className="space-y-2">
                {topRisks.map((r) => (
                  <li key={r.id} className="text-[12px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-on-surface font-medium leading-snug">{r.title}</span>
                      <SeverityChip sev={r.severity} />
                    </div>
                    <p className="text-on-surface-variant mt-0.5 line-clamp-2 text-[11px] leading-snug">
                      {r.body}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </aside>
      </main>

      {/* Bottom action bar — phases + totals */}
      <div className="border-outline-variant/70 bg-surface/85 sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-2.5 backdrop-blur md:px-10">
        <div className="flex flex-wrap items-center gap-1">
          {PHASES.map((label) => (
            <span
              key={label}
              className="bg-primary/[0.07] text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            >
              <span aria-hidden className="bg-primary size-1 rounded-full" />
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[11.5px]">
          <Stat label="est. cost" value={`${fmtUsd(totalCost)}/mo`} />
          <Stat label="components" value={String(pkg.nodes.length)} />
          <Stat label="sources" value={String(pkg.sources.length)} />
          <Stat label="risks" value={String(pkg.risks.length)} />
        </div>
      </div>

      {/* Drill-downs — full risks, BOM, sources, roadmap */}
      <section className="mx-auto max-w-7xl space-y-4 px-6 py-8 md:px-10">
        {pkg.flowNarrative.length ? (
          <Drilldown title={`Request lifecycle · ${pkg.flowNarrative.length} steps`}>
            <ol className="space-y-3">
              {pkg.flowNarrative.map((step, i) => (
                <li key={step.id} className="flex gap-3 text-[13px]">
                  <span className="bg-primary-container text-on-primary-container grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="text-on-surface-variant text-[12px] leading-relaxed">
                      {step.body}
                    </p>
                    {step.nodes.length ? (
                      <p className="text-on-surface-variant mt-0.5 text-[10px] uppercase tracking-wide opacity-80">
                        {step.nodes.join(" → ")}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Drilldown>
        ) : null}

        {pkg.decisions.length ? (
          <Drilldown title={`All decisions · ${pkg.decisions.length}`}>
            <div className="grid gap-3">
              {pkg.decisions.map((d) => (
                <DecisionCard key={d.id} decision={d} sources={pkg.sources} />
              ))}
            </div>
          </Drilldown>
        ) : null}

        {pkg.bom.length ? (
          <Drilldown
            title={`Bill of materials · ${pkg.bom.length} lines · ${fmtUsd(totalCost)}/mo`}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12.5px]">
                <thead className="text-on-surface-variant text-[10.5px] uppercase">
                  <tr className="border-outline-variant/60 border-b">
                    <th className="py-2 pr-4">Component</th>
                    <th className="py-2 pr-4">Kind</th>
                    <th className="py-2 pr-4 text-right">Base / mo</th>
                    <th className="py-2 pr-4">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.bom.map((l) => {
                    const cite = pkg.sources.find((s) => s.id === l.cite);
                    return (
                      <tr key={l.id} className="border-outline-variant/40 border-b">
                        <td className="py-2 pr-4 font-medium">{l.name}</td>
                        <td className="py-2 pr-4">
                          <span className="bg-surface-container rounded px-1.5 py-0.5 text-[10.5px]">
                            {l.kind}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(l.baseCost)}</td>
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
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-outline-variant/60 border-t font-semibold">
                    <td colSpan={2} className="py-2 pr-4">
                      Estimated total
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtUsd(totalCost)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Drilldown>
        ) : null}

        {pkg.risks.length ? (
          <Drilldown title={`All risks · ${pkg.risks.length}`}>
            <div className="grid gap-3">
              {pkg.risks.map((r) => (
                <RiskCard key={r.id} risk={r} sources={pkg.sources} />
              ))}
            </div>
          </Drilldown>
        ) : null}

        {pkg.sources.length ? (
          <Drilldown title={`Sources · ${pkg.sources.length}`}>
            <ol className="divide-outline-variant/60 divide-y">
              {pkg.sources.map((s) => (
                <li key={s.id} className="flex items-baseline gap-3 py-2 text-[12.5px]">
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
          </Drilldown>
        ) : null}

        {pkg.roadmap.length ? (
          <Drilldown title={`Roadmap · ${pkg.roadmap.length}`}>
            <ol className="space-y-2">
              {pkg.roadmap.map((r, i) => (
                <li key={r.id} className="flex gap-3 text-[12.5px]">
                  <span className="bg-primary-container text-on-primary-container grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">
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
          </Drilldown>
        ) : null}
      </section>

      <footer className="text-on-surface-variant border-outline-variant/60 mx-auto max-w-7xl border-t px-6 py-6 text-[11px] md:px-10">
        Generated by TESSAR — recommendations are starting points, not a substitute for security
        review or load testing. KB snapshot{" "}
        <code className="bg-surface-container rounded px-1 py-0.5">{pkg.kbSnapshotId}</code>.
      </footer>
    </div>
  );
}

// ─── Local primitives ──────────────────────────────────────────

function SectionCard({
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
      className={`border-outline-variant/60 bg-surface-container-low rounded-2xl border p-3.5 ${className}`}
    >
      <h2 className="text-on-surface-variant mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <span className="text-on-surface-variant inline-flex items-baseline gap-1">
      <span className="text-on-surface font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
    </span>
  );
}

function SeverityChip({ sev }: { sev: "low" | "med" | "high" }): React.ReactElement {
  const cls =
    sev === "high"
      ? "bg-error-container text-on-error-container"
      : sev === "med"
        ? "bg-tertiary-container text-on-tertiary-container"
        : "bg-surface-container text-on-surface-variant";
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ${cls}`}
    >
      {sev}
    </span>
  );
}

function Drilldown({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="border-outline-variant/60 bg-surface-container-low rounded-2xl border"
    >
      <summary className="hover:bg-on-surface/[0.04] flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-5 py-3 text-[13px] font-semibold">
        {title}
        <span aria-hidden className="text-on-surface-variant text-[12px]">
          {open ? "−" : "+"}
        </span>
      </summary>
      <div className="border-outline-variant/60 border-t px-5 py-4">{children}</div>
    </details>
  );
}
