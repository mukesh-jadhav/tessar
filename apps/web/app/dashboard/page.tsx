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
 * Story: this is where you come back to your past decisions. Each card is one
 * past brief + the package it produced. The brief itself is the headline (it
 * is what the user wrote and what they recognize); status, counts, and date
 * are quiet supporting metadata. One primary action per card.
 *
 * Two states:
 *   - empty: hero "Start your first run" → /brief
 *   - non-empty: tight summary line + filterable card grid
 *
 * `?empty=1` forces the empty state for design review.
 * ------------------------------------------------------------------------- */

type Filter = "all" | RunStatus;

export default function DashboardPage(): React.ReactElement {
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
    const sources = runs.reduce((s, r) => s + r.sources, 0);
    return { runs: runs.length, completed, spent, components, sources };
  }, [runs]);

  return (
    <div className="bg-surface text-on-surface relative min-h-dvh w-full overflow-x-hidden">
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

      <header className="border-outline-variant/60 bg-surface/80 sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-6 py-3 backdrop-blur md:px-10">
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
          <ThemeToggle />
          <Link href="/brief">
            <Button className="ml-1 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold">
              New run +
            </Button>
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1200px] px-6 py-10 md:px-10 md:py-14">
        {!loaded ? null : runs.length === 0 ? (
          <EmptyHero />
        ) : (
          <>
            <SummaryLine totals={totals} />
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
        Describe the system in plain words. About twelve minutes later you&apos;ll have a
        researched, defensible architecture you can take to anyone.
      </p>
      <div className="mt-7 flex items-center justify-center">
        <Link href="/brief">
          <Button className="rounded-full px-6 py-2.5 text-[13px] font-semibold">
            Start a brief →
          </Button>
        </Link>
      </div>
    </motion.section>
  );
}

function SummaryLine({
  totals,
}: {
  totals: { runs: number; completed: number; spent: number; components: number; sources: number };
}): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={expressiveDefault}
    >
      <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
        Welcome back
      </p>
      <h1 className="text-on-surface mt-2 font-serif text-[32px] leading-[1.1] md:text-[40px]">
        {totals.completed === 0
          ? "Your first decision is in progress."
          : totals.completed === 1
            ? "One decision made. Ready for the next?"
            : `${totals.completed} decisions made. Ready for the next?`}
      </h1>
      <p className="text-on-surface-variant mt-2 text-[13px]">
        <span className="text-on-surface font-semibold tabular-nums">{totals.runs}</span> run
        {totals.runs === 1 ? "" : "s"} · <span className="tabular-nums">${totals.spent}</span> spent
        · <span className="tabular-nums">{totals.components}</span> components researched ·{" "}
        <span className="tabular-nums">{totals.sources}</span> sources cited
      </p>
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
    <div className="mb-4 mt-9 flex items-center justify-between gap-3">
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

/* ─── RunCard ───────────────────────────────────────────────── */

function RunCard({ run }: { run: RunSummary }): React.ReactElement {
  // One primary destination per card. The whole card is clickable.
  const primaryHref =
    run.status === "completed"
      ? `/decide/${run.id}`
      : run.status === "in_progress"
        ? `/run/${run.id}`
        : `/brief`;
  const primaryLabel =
    run.status === "completed"
      ? "Open package →"
      : run.status === "in_progress"
        ? "Watch live →"
        : run.status === "failed"
          ? "Retry brief →"
          : "Re-run →";

  return (
    <Link
      href={primaryHref}
      className="border-outline-variant bg-surface/95 hover:border-primary/60 focus-visible:border-primary group flex h-full flex-col rounded-2xl border p-4 backdrop-blur transition-[border-color,box-shadow] hover:shadow-[0_4px_24px_-12px_rgb(var(--md-sys-color-primary)/0.35)] focus-visible:outline-none"
    >
      {/* Eyebrow row: domain · status · run id */}
      <header className="flex items-center justify-between gap-2">
        <div className="text-on-surface-variant flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
          <span>{run.domain}</span>
          <span aria-hidden>·</span>
          <span className="text-on-surface-variant/80 font-mono lowercase tracking-normal">
            #{run.id.slice(0, 7)}
          </span>
        </div>
        <StatusPill status={run.status} />
      </header>

      {/* Brief title — the headline. */}
      <p className="text-on-surface mt-3 line-clamp-3 text-[14px] font-medium leading-snug">
        {run.brief}
      </p>

      {/* Meta strip — quiet supporting numbers. */}
      <dl className="text-on-surface-variant mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[10.5px]">
        {run.status === "completed" || run.status === "refunded" ? (
          <>
            <Stat label="Components" value={run.components.toString()} />
            <Stat label="Sources" value={run.sources.toString()} />
            <Stat label="Took" value={`${Math.max(1, Math.round(run.durationSec / 60))}m`} />
          </>
        ) : run.status === "in_progress" ? (
          <Stat label="Status" value="Researching now" />
        ) : (
          <Stat label="Status" value="Did not complete" />
        )}
      </dl>

      {/* Footer: date + primary action. */}
      <footer className="border-outline-variant mt-4 flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-on-surface-variant text-[11px]">{fmtDate(run.createdAt)}</span>
        <span className="text-primary inline-flex items-center gap-1 text-[11.5px] font-semibold transition-transform group-hover:translate-x-0.5">
          {primaryLabel}
        </span>
      </footer>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[9.5px] uppercase tracking-wider">{label}</dt>
      <dd className="text-on-surface text-[12px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
