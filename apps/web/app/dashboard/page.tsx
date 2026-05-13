"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { type RunStatus, type RunSummary } from "@/lib/mocks/past-runs";
import { springs } from "@/lib/motion/springs";

const expressiveDefault = springs.expressiveDefault;

/* ---------------------------------------------------------------------------
 * /dashboard — Account home + run history.
 *
 * Two states:
 *   - empty: hero card "Start your first run" → /brief
 *   - non-empty: counters + filterable card grid of past runs
 *
 * Toggle the URL `?empty=1` to demo the empty state. Phase 2 will compute
 * emptiness from the real `runs` table.
 * ------------------------------------------------------------------------- */

type Filter = "all" | RunStatus;

export default function DashboardPage(): React.ReactElement {
  // Real data from /api/runs (auth-gated). On error or while loading we
  // render the empty hero rather than a spinner — it's the same component,
  // so there's no layout pop. The `?empty=1` URL param still forces empty
  // for design review.
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const forceEmpty = new URLSearchParams(window.location.search).has("empty");
    if (forceEmpty) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const res = await fetch("/api/runs", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const data = (await res.json()) as { runs: RunSummary[] };
        if (!cancelled) {
          setRuns(data.runs);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [filter, setFilter] = useState<Filter>("all");
  const filtered = useMemo(
    () => (filter === "all" ? runs : runs.filter((r) => r.status === filter)),
    [filter, runs],
  );

  const totals = useMemo(() => {
    const completed = runs.filter((r) => r.status === "completed").length;
    const spent = runs.reduce((s, r) => s + r.paidUsd, 0);
    const components = runs.reduce((s, r) => s + r.components, 0);
    return { runs: runs.length, completed, spent, components };
  }, [runs]);

  return (
    <div className="bg-surface text-on-surface relative min-h-dvh w-screen overflow-x-hidden">
      {/* Canvas backdrop — same language as / */}
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

      <header className="border-outline-variant bg-surface/85 sticky top-0 z-20 flex items-center justify-between border-b px-6 py-3 backdrop-blur md:px-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="bg-primary text-on-primary grid size-7 place-items-center rounded-full shadow-[0_4px_14px_-6px_rgb(var(--md-sys-color-primary)/0.5)]"
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
          <span className="text-on-surface-variant text-[11px]">· dashboard</span>
        </div>
        <nav className="flex items-center gap-1.5 text-[11.5px]">
          <Link
            href="/billing"
            className="text-on-surface-variant hover:bg-on-surface/[0.04] hover:text-on-surface rounded-full px-3 py-1.5 font-medium"
          >
            Billing
          </Link>
          <Link
            href="/signin"
            className="text-on-surface-variant hover:bg-on-surface/[0.04] hover:text-on-surface rounded-full px-3 py-1.5 font-medium"
          >
            Sign out
          </Link>
          <ThemeToggle />
          <Link href="/brief">
            <Button className="ml-1 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold">
              New run +
            </Button>
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1200px] px-6 py-8 md:px-10">
        {!loaded ? null : runs.length === 0 ? (
          <EmptyHero />
        ) : (
          <>
            <SummaryRow totals={totals} />
            <FilterBar filter={filter} setFilter={setFilter} runs={runs} />
            <RunGrid runs={filtered} />
          </>
        )}
      </main>
    </div>
  );
}

function EmptyHero(): React.ReactElement {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={expressiveDefault}
      className="border-outline-variant bg-surface/95 mx-auto mt-12 max-w-[640px] rounded-3xl border p-10 text-center backdrop-blur"
    >
      <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
        First run
      </p>
      <h1 className="text-on-surface mt-2 font-serif text-[32px] leading-tight md:text-[40px]">
        Decide what to build.
      </h1>
      <p className="text-on-surface-variant mx-auto mt-3 max-w-[460px] text-[13.5px] leading-relaxed">
        Describe the system in plain words. About 12 minutes later you&apos;ll have a researched,
        defensible architecture you can defend to anyone.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link href="/brief">
          <Button className="rounded-full px-6 py-2.5 text-[13px] font-semibold">
            Start a brief →
          </Button>
        </Link>
        <Link
          href="/decide"
          className="text-on-surface-variant hover:text-on-surface text-[12px] font-medium underline-offset-2 hover:underline"
        >
          See a sample first
        </Link>
      </div>
    </motion.section>
  );
}

function SummaryRow({
  totals,
}: {
  totals: { runs: number; completed: number; spent: number; components: number };
}): React.ReactElement {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <SummaryCard label="Runs" value={totals.runs.toString()} sub="all-time" />
      <SummaryCard
        label="Completed"
        value={totals.completed.toString()}
        sub={`${Math.round((totals.completed / Math.max(1, totals.runs)) * 100)}% success`}
      />
      <SummaryCard
        label="Spent"
        value={`$${totals.spent}`}
        sub={`${totals.runs > 0 ? `$${(totals.spent / totals.runs).toFixed(0)} avg` : "—"}`}
      />
      <SummaryCard
        label="Components"
        value={totals.components.toString()}
        sub="researched & cited"
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={expressiveDefault}
      className="border-outline-variant bg-surface/95 rounded-2xl border px-4 py-3 backdrop-blur"
    >
      <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
      <p className="text-on-surface mt-1 text-[26px] font-semibold tabular-nums">{value}</p>
      <p className="text-on-surface-variant text-[10.5px]">{sub}</p>
    </motion.div>
  );
}

function FilterBar({
  filter,
  setFilter,
  runs,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  runs: RunSummary[];
}): React.ReactElement {
  const counts: Record<Filter, number> = {
    all: runs.length,
    completed: runs.filter((r) => r.status === "completed").length,
    in_progress: runs.filter((r) => r.status === "in_progress").length,
    failed: runs.filter((r) => r.status === "failed").length,
    refunded: runs.filter((r) => r.status === "refunded").length,
  };
  const opts: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "completed", label: "Completed" },
    { id: "in_progress", label: "In progress" },
    { id: "failed", label: "Failed" },
    { id: "refunded", label: "Refunded" },
  ];
  return (
    <div className="mb-4 mt-7 flex items-center justify-between gap-3">
      <h2 className="text-on-surface font-serif text-[20px] leading-tight">Past runs</h2>
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const c = counts[o.id];
          const active = filter === o.id;
          if (c === 0 && o.id !== "all") return null;
          return (
            <button
              key={o.id}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(o.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant bg-surface text-on-surface-variant hover:border-primary/50 hover:text-primary"
              }`}
            >
              {o.label}{" "}
              <span className={`ml-0.5 tabular-nums ${active ? "" : "text-on-surface-variant/70"}`}>
                {c}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RunGrid({ runs }: { runs: RunSummary[] }): React.ReactElement {
  if (runs.length === 0) {
    return (
      <p className="text-on-surface-variant mt-12 text-center text-[12px]">
        No runs match this filter.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {runs.map((r, i) => (
        <motion.li
          key={r.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...expressiveDefault, delay: i * 0.04 }}
        >
          <RunCard run={r} />
        </motion.li>
      ))}
    </ul>
  );
}

function RunCard({ run }: { run: RunSummary }): React.ReactElement {
  return (
    <article className="border-outline-variant bg-surface/95 hover:border-primary/50 group flex h-full flex-col rounded-2xl border p-4 backdrop-blur transition-colors">
      <header className="flex items-center justify-between gap-2">
        <span className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
          {run.domain}
        </span>
        <StatusPill status={run.status} />
      </header>
      <p className="text-on-surface mt-2 line-clamp-3 text-[12.5px] leading-relaxed">{run.brief}</p>
      <dl className="border-outline-variant text-on-surface-variant mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-[10.5px]">
        <Stat label="Components" value={run.components.toString()} />
        <Stat label="Sources" value={run.sources.toString()} />
        <Stat label="Duration" value={`${Math.round(run.durationSec / 60)}m`} />
      </dl>
      <footer className="mt-3 flex items-center justify-between gap-2">
        <span className="text-on-surface-variant text-[10.5px]">{fmtDate(run.createdAt)}</span>
        <div className="flex items-center gap-2">
          {run.status === "completed" ? (
            <Link
              href="/decide"
              className="border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary rounded-full border px-3 py-1 text-[11px] font-semibold"
            >
              Open
            </Link>
          ) : null}
          <Link
            href="/brief"
            className="bg-primary/10 text-primary hover:bg-primary/20 rounded-full px-3 py-1 text-[11px] font-semibold"
          >
            Re-run
          </Link>
        </div>
      </footer>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-[9.5px] uppercase tracking-wider">{label}</dt>
      <dd className="text-on-surface text-[12px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
