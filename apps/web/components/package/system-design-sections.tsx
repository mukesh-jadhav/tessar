/**
 * <SystemDesignSections /> — ADR-0006 narrative artifacts.
 *
 * Five renderable sections fed by RunPackage's optional narrative fields:
 *   - SequenceDiagrams (write / read / async)
 *   - IntegrationContracts (table)
 *   - ComponentRationales ("fits because" per critical pick)
 *   - FailureModes (with detection / recovery / RTO / RPO)
 *   - BuildSequence (phased build order)
 *
 * Mermaid diagrams are rendered to SVG client-side via the lazy-loaded
 * <MermaidBlock /> component (the mermaid library only lands in the
 * bundle when this section actually mounts). The PDF export keeps the
 * verbatim Mermaid source as a fenced code block — it is the archival
 * record; the rendered visual lives here.
 */

import { MermaidBlock } from "@/components/package/mermaid-block";
import type {
  ArchNode,
  BuildPhase,
  ComponentRationale,
  FailureMode,
  IntegrationContract,
  SequenceDiagram,
} from "@/lib/run-package";

/* ─── Section: Sequence diagrams ───────────────────────────────── */

export function SequenceDiagramsSection({
  diagrams,
}: {
  diagrams: SequenceDiagram[];
}): React.ReactElement | null {
  if (!diagrams.length) return null;
  return (
    <SectionCard
      title="Sequence diagrams"
      hint="How requests actually move through the system. Three views: a typical write, a typical read, and the async background path."
    >
      <div className="space-y-6">
        {diagrams.map((d) => (
          <SequenceDiagramItem key={d.id} d={d} />
        ))}
      </div>
    </SectionCard>
  );
}

function SequenceDiagramItem({ d }: { d: SequenceDiagram }): React.ReactElement {
  return (
    <article className="border-outline-variant/60 rounded-xl border p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{d.title}</h3>
        <KindBadge kind={d.kind} />
      </header>
      <p className="text-on-surface-variant mt-1 text-[13px] leading-relaxed">{d.summary}</p>
      {d.participants.length ? (
        <p className="text-on-surface-variant mt-2 text-[10px] uppercase tracking-wide opacity-80">
          participants: {d.participants.join(" · ")}
        </p>
      ) : null}
      <MermaidBlock id={d.id} source={d.mermaid} className="mt-3" />
    </article>
  );
}

function KindBadge({ kind }: { kind: SequenceDiagram["kind"] }): React.ReactElement {
  const styles: Record<SequenceDiagram["kind"], string> = {
    write: "bg-primary-container text-on-primary-container",
    read: "bg-secondary-container text-on-secondary-container",
    async: "bg-tertiary-container text-on-tertiary-container",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[kind]}`}
    >
      {kind}
    </span>
  );
}

/* ─── Section: Integration contracts ───────────────────────────── */

export function IntegrationContractsSection({
  contracts,
  onCite,
}: {
  contracts: IntegrationContract[];
  onCite?: (n: number) => void;
}): React.ReactElement | null {
  if (!contracts.length) return null;
  return (
    <SectionCard
      title="Integration contracts"
      hint="The wire-level agreement at every critical boundary: payload, idempotency, retry, delivery semantics."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
          <thead className="text-on-surface-variant border-outline-variant/60 border-b text-[10px] uppercase tracking-wide">
            <tr>
              <th className="py-2 pr-3 font-semibold">Edge</th>
              <th className="py-2 pr-3 font-semibold">Mode</th>
              <th className="py-2 pr-3 font-semibold">Payload</th>
              <th className="py-2 pr-3 font-semibold">Idempotency</th>
              <th className="py-2 pr-3 font-semibold">Retry</th>
              <th className="py-2 pr-0 font-semibold">Semantics</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr
                key={c.edgeId}
                className="border-outline-variant/40 border-b align-top last:border-0"
              >
                <td className="py-3 pr-3">
                  <div className="font-mono text-[11px]">
                    {c.from} → {c.to}
                  </div>
                  <CiteLink n={c.cite} onCite={onCite} />
                </td>
                <td className="py-3 pr-3">
                  <ModeBadge mode={c.mode} />
                </td>
                <td className="py-3 pr-3 font-mono text-[11px]">{c.payload}</td>
                <td className="py-3 pr-3">{c.idempotency}</td>
                <td className="py-3 pr-3">{c.retry}</td>
                <td className="py-3 pr-0">
                  <SemanticsBadge value={c.semantics} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function ModeBadge({ mode }: { mode: "sync" | "async" }): React.ReactElement {
  const styles =
    mode === "sync"
      ? "bg-primary-container text-on-primary-container"
      : "bg-tertiary-container text-on-tertiary-container";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${styles}`}>
      {mode}
    </span>
  );
}

function SemanticsBadge({
  value,
}: {
  value: IntegrationContract["semantics"];
}): React.ReactElement {
  return (
    <span className="bg-surface-container text-on-surface-variant rounded-full px-2 py-0.5 text-[10px] font-semibold">
      {value}
    </span>
  );
}

/* ─── Section: Component rationales ────────────────────────────── */

export function ComponentRationalesSection({
  rationales,
  nodes,
  onCite,
}: {
  rationales: ComponentRationale[];
  nodes: ArchNode[];
  onCite?: (n: number) => void;
}): React.ReactElement | null {
  if (!rationales.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <SectionCard
      title="Why these components"
      hint='"Fits because" — the explicit link from each critical pick back to a requirement.'
    >
      <ul className="space-y-3">
        {rationales.map((r) => {
          const node = byId.get(r.nodeId);
          return (
            <li
              key={`${r.nodeId}-${r.requirementId}`}
              className="border-outline-variant/60 rounded-xl border p-4"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold">
                  {node?.label ?? r.nodeId}
                  <span className="text-on-surface-variant ml-2 text-[11px] font-normal">
                    fits {r.requirementId}
                  </span>
                </h3>
                <CiteLink n={r.cite} onCite={onCite} />
              </header>
              <p className="text-on-surface mt-2 text-[13px] leading-relaxed">{r.narrative}</p>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

/* ─── Section: Failure modes ───────────────────────────────────── */

export function FailureModesSection({
  modes,
  nodes,
  onCite,
}: {
  modes: FailureMode[];
  nodes: ArchNode[];
  onCite?: (n: number) => void;
}): React.ReactElement | null {
  if (!modes.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <SectionCard
      title="Failure modes"
      hint="What breaks, how we detect it, how we recover. RTO = time to restore service. RPO = max acceptable data loss."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
          <thead className="text-on-surface-variant border-outline-variant/60 border-b text-[10px] uppercase tracking-wide">
            <tr>
              <th className="py-2 pr-3 font-semibold">Component</th>
              <th className="py-2 pr-3 font-semibold">Failure mode</th>
              <th className="py-2 pr-3 font-semibold">Detection</th>
              <th className="py-2 pr-3 font-semibold">Recovery</th>
              <th className="py-2 pr-3 font-semibold">RTO</th>
              <th className="py-2 pr-0 font-semibold">RPO</th>
            </tr>
          </thead>
          <tbody>
            {modes.map((m) => {
              const node = byId.get(m.nodeId);
              return (
                <tr
                  key={m.id}
                  className="border-outline-variant/40 border-b align-top last:border-0"
                >
                  <td className="py-3 pr-3">
                    <div className="font-medium">{node?.label ?? m.nodeId}</div>
                    <CiteLink n={m.cite} onCite={onCite} />
                  </td>
                  <td className="py-3 pr-3">{m.mode}</td>
                  <td className="py-3 pr-3">{m.detection}</td>
                  <td className="py-3 pr-3">{m.recovery}</td>
                  <td className="py-3 pr-3 font-mono text-[11px]">{m.rto}</td>
                  <td className="py-3 pr-0 font-mono text-[11px]">{m.rpo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/* ─── Section: Build sequence ──────────────────────────────────── */

export function BuildSequenceSection({
  phases,
  nodes,
}: {
  phases: BuildPhase[];
  nodes: ArchNode[];
}): React.ReactElement | null {
  if (!phases.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <SectionCard
      title="Build sequence"
      hint="Recommended order of build. Smallest deployable slice first; defer the rest until each phase's trigger fires."
    >
      <ol className="space-y-4">
        {phases.map((p, i) => (
          <li key={p.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="bg-primary-container text-on-primary-container grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold">
                {i + 1}
              </span>
              {i < phases.length - 1 ? (
                <span className="bg-outline-variant/60 mt-1 w-px flex-1" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <header className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-[14px] font-semibold">{p.title}</h3>
                <span className="text-on-surface-variant text-[11px] uppercase tracking-wide">
                  {p.label}
                </span>
              </header>
              <p className="text-on-surface mt-2 text-[13px] leading-relaxed">{p.rationale}</p>
              {p.nodes.length ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {p.nodes.map((nid) => (
                    <li
                      key={nid}
                      className="border-outline-variant/60 text-on-surface-variant rounded-full border px-2 py-0.5 text-[10px] font-medium"
                    >
                      {byId.get(nid)?.label ?? nid}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

/* ─── Composite: System Design pane ────────────────────────────── */

export function SystemDesignPane({
  sequenceDiagrams = [],
  integrationContracts = [],
  componentRationales = [],
  failureModes = [],
  buildSequence = [],
  nodes = [],
  onCite,
}: {
  sequenceDiagrams?: SequenceDiagram[];
  integrationContracts?: IntegrationContract[];
  componentRationales?: ComponentRationale[];
  failureModes?: FailureMode[];
  buildSequence?: BuildPhase[];
  nodes?: ArchNode[];
  onCite?: (n: number) => void;
}): React.ReactElement {
  const empty =
    !sequenceDiagrams.length &&
    !integrationContracts.length &&
    !componentRationales.length &&
    !failureModes.length &&
    !buildSequence.length;
  if (empty) {
    return (
      <SectionCard
        title="System design"
        hint="The architect agent will populate this section once Phase 3 follow-up work lands (ADR-0006)."
      >
        <p className="text-on-surface-variant text-[13px]">
          No system-design narrative was emitted for this run.
        </p>
      </SectionCard>
    );
  }
  return (
    <div className="space-y-6">
      <ComponentRationalesSection rationales={componentRationales} nodes={nodes} onCite={onCite} />
      <SequenceDiagramsSection diagrams={sequenceDiagrams} />
      <IntegrationContractsSection contracts={integrationContracts} onCite={onCite} />
      <FailureModesSection modes={failureModes} nodes={nodes} onCite={onCite} />
      <BuildSequenceSection phases={buildSequence} nodes={nodes} />
    </div>
  );
}

/* ─── Local primitives ─────────────────────────────────────────── */

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="border-outline-variant/60 bg-surface-container-low rounded-2xl border p-5">
      <header className="mb-3">
        <h2 className="text-on-surface-variant text-[11px] font-semibold uppercase tracking-wide">
          {title}
        </h2>
        {hint ? (
          <p className="text-on-surface-variant mt-1 text-[12px] leading-relaxed opacity-80">
            {hint}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function CiteLink({ n, onCite }: { n: number; onCite?: (n: number) => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onCite ? () => onCite(n) : undefined}
      className="text-on-surface-variant hover:text-primary text-[10px] font-medium uppercase tracking-wide opacity-70 transition-colors"
    >
      [{n}]
    </button>
  );
}
