"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { WavyProgress } from "@/components/ui/wavy-progress";
import { Button } from "@/components/ui/button";
import { ConfidencePill } from "@/components/ui/confidence-pill";
import { Counter } from "@/components/ui/counter";
import {
  PHASE_LABELS,
  PHASE_ORDER,
  type Phase,
  type RecordedEvent,
} from "@/lib/mocks/recorded-run";
import { springs } from "@/lib/motion/springs";

const expressiveDefault = springs.expressiveDefault;
const expressiveFast = springs.expressiveFast;

/* ---------------------------------------------------------------------------
 * /run/[id] — Live run-progress view.
 *
 * Single viewport, no scroll. Three columns at lg+:
 *
 *   ┌───────────────────────────────────────────────────────────────────┐
 *   │ ✓ TESSAR · brief title             phase · elapsed · theme        │
 *   ├──────────────┬────────────────────────────────┬───────────────────┤
 *   │ TIMELINE     │   HERO                         │  DECISIONS        │
 *   │ phase events │   current phase + wavy prog    │  converging       │
 *   │ stream in    │   live counters                │                   │
 *   │              │   inline clarifying card       │  SOURCES          │
 *   │              │                                │  scrollable list  │
 *   └──────────────┴────────────────────────────────┴───────────────────┘
 *
 *   - Source-of-truth: SSE stream from `/api/mock-runs/[id]/events`.
 *   - Reducer in this component aggregates events into render state.
 *   - When the `done` event lands, the CTA at the bottom flips to "Open
 *     the package →" and routes to /decide.
 * ------------------------------------------------------------------------- */

type ClientEvent = RecordedEvent;

interface RunState {
  startedAt: number | null;
  phaseStatus: Partial<Record<Phase, "started" | "completed">>;
  /** Most-recently-active phase (one of "started" — for the hero). */
  currentPhase: Phase | null;
  /** Ordered list of timeline entries (phases + completion notes). */
  timeline: Array<{
    id: string;
    phase: Phase;
    label: string;
    note?: string;
    status: "started" | "completed";
    t: number;
  }>;
  decisions: Array<{
    id: string;
    topic: string;
    pick: string;
    conf: "low" | "med" | "high";
    t: number;
  }>;
  sources: Array<{
    id: number;
    title: string;
    publisher: string;
    t: number;
  }>;
  metrics: { tokens: number; costUsd: number; sources: number };
  clarify: { id: string; question: string; chips: string[] } | null;
  done: boolean;
}

const INITIAL: RunState = {
  startedAt: null,
  phaseStatus: {},
  currentPhase: null,
  timeline: [],
  decisions: [],
  sources: [],
  metrics: { tokens: 0, costUsd: 0, sources: 0 },
  clarify: null,
  done: false,
};

function reduce(state: RunState, ev: ClientEvent): RunState {
  switch (ev.kind) {
    case "hello":
      return state.startedAt === null ? { ...state, startedAt: Date.now() } : state;
    case "phase": {
      const { phase, status, note } = ev.payload;
      const id = `${phase}-${status}-${ev.t}`;
      // Dedupe: in dev React.StrictMode mounts the effect twice and both
      // EventSource connections replay the same phase frames from t=0.
      // In prod the same guard protects against transient SSE reconnects.
      if (state.timeline.some((entry) => entry.id === id)) return state;
      const phaseStatus = { ...state.phaseStatus, [phase]: status };
      const currentPhase =
        status === "started"
          ? phase
          : // On completion, advance to the next started-but-not-completed phase if any.
            state.currentPhase === phase
            ? findNextActive(phaseStatus)
            : state.currentPhase;
      return {
        ...state,
        phaseStatus,
        currentPhase,
        timeline: [
          ...state.timeline,
          { id, phase, label: PHASE_LABELS[phase], note, status, t: ev.t },
        ],
      };
    }
    case "decision":
      if (state.decisions.some((d) => d.id === ev.payload.id)) return state;
      return {
        ...state,
        decisions: [...state.decisions, { ...ev.payload, t: ev.t }],
      };
    case "source":
      if (state.sources.some((s) => s.id === ev.payload.id)) return state;
      return {
        ...state,
        sources: [{ ...ev.payload, t: ev.t }, ...state.sources].slice(0, 30),
      };
    case "metric":
      // Merge instead of replace: backend metric events may omit fields
      // (e.g. `sources`) on phases that didn't change them. A wholesale
      // replace would make `state.metrics.sources` undefined and crash
      // the Counter render at the bottom of the page.
      return { ...state, metrics: { ...state.metrics, ...ev.payload } };
    case "clarify":
      return { ...state, clarify: ev.payload };
    case "done":
      return { ...state, done: true, currentPhase: null };
  }
}

function findNextActive(s: Partial<Record<Phase, "started" | "completed">>): Phase | null {
  for (const p of PHASE_ORDER) {
    if (s[p] === "started") return p;
  }
  return null;
}

// ─── Page ──────────────────────────────────────────────────────

export default function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(params);
  const [state, setState] = useState<RunState>(INITIAL);
  const [speed, setSpeed] = useState<1 | 2 | 5>(2);
  // SSE connection lifecycle, surfaced as a small pill in the header so the
  // user can tell whether the live feed is healthy. EventSource auto-retries
  // on transient drops, so we only need three states.
  const [conn, setConn] = useState<"connecting" | "live" | "retrying">("connecting");
  // Primary download artifact + a hint that the run finished server-side.
  // We fetch /api/runs/[id] (a) when `done` lands so the CTA can become a
  // real download link, and (b) on first mount in case the user hard-refreshes
  // after the SSE has already closed (replay still feeds state, but the
  // Markdown package lives in GCS, not in events).
  const [artifacts, setArtifacts] = useState<{ md?: string; pdf?: string }>({});

  // SSE connection — closes & reconnects when speed changes so the demo
  // stays snappy. Real Phase-2 endpoint at `/api/runs/[id]/events`; the
  // Phase-1 mock at `/api/mock-runs/[id]/events` still exists for the
  // design-system page and Storybook playback. Wire format is identical.
  useEffect(() => {
    setConn("connecting");
    const es = new EventSource(`/api/runs/${id}/events`);
    es.onopen = () => setConn("live");
    const handler = (msg: MessageEvent<string>): void => {
      try {
        const ev = JSON.parse(msg.data) as ClientEvent;
        setState((s) => reduce(s, ev));
      } catch {
        // Malformed frame — log and skip; the SSE stream is best-effort.
        console.warn("malformed event", msg.data);
      }
    };
    // We dispatch on named event types because the route emits `event:` lines.
    for (const t of ["hello", "phase", "decision", "source", "metric", "clarify", "done"]) {
      es.addEventListener(t, handler as EventListener);
    }
    es.onerror = () => {
      // Browsers retry automatically; we surface the state so the user knows.
      setConn("retrying");
      console.info("SSE retry…");
    };
    return () => es.close();
    // Real-run cadence is owned by the worker — speed has no effect on
    // /api/runs/* and re-subscribing per change would just reset state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Fetch run detail when the SSE stream reports done, OR once on mount
  // (covers refresh-after-completion). Prefers the Markdown package; falls
  // back to whatever the worker produced first. Cheap and idempotent.
  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          run: { status: string };
          artifacts: Array<{ kind: string; url: string }>;
        };
        if (cancelled) return;
        if (data.run.status === "succeeded" && !state.done) {
          // The user landed after completion — flip the local flag so
          // the CTA shows even though no `done` event will arrive.
          setState((s) => ({ ...s, done: true, currentPhase: null }));
        }
        const md = data.artifacts.find((a) => a.kind === "package_md")?.url;
        const pdf = data.artifacts.find((a) => a.kind === "package_pdf")?.url;
        // Fallback for any future artifact kind: surface as md slot if no
        // dedicated md was produced (better than dropping it on the floor).
        const fallback = !md && !pdf ? data.artifacts[0]?.url : undefined;
        setArtifacts({ md: md ?? fallback, pdf });
      } catch {
        // Best-effort; the user can still navigate to /dashboard.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when `done` flips so we pick up the artifact row that the
    // worker writes immediately before emitting the done event.
  }, [id, state.done]);

  const elapsed = useElapsed(state.startedAt, state.done);
  const completedPhases = PHASE_ORDER.filter((p) => state.phaseStatus[p] === "completed").length;
  const progressPct = Math.round((completedPhases / PHASE_ORDER.length) * 100);
  const heroPhase = state.currentPhase ?? PHASE_ORDER[completedPhases - 1] ?? null;

  return (
    <div className="bg-surface text-on-surface relative h-dvh w-screen overflow-hidden">
      {/* Soft brand wash + grid — same canvas language as / and /decide. */}
      <CanvasBackdrop />

      {/* Floating top chrome */}
      <header
        className="absolute left-6 right-6 top-5 z-20 flex items-center justify-between md:left-10 md:right-10 md:top-7"
        aria-label="Run progress header"
      >
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
          <span className="text-on-surface-variant ml-2 hidden text-[11px] md:inline">
            · run #{id.slice(0, 6)}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ConnPill conn={state.done ? "done" : conn} />
          <SpeedToggle speed={speed} onChange={setSpeed} done={state.done} />
          <ThemeToggle />
        </div>
      </header>

      <main className="absolute inset-0 grid grid-rows-[1fr_auto] pt-20">
        <div className="grid min-h-0 grid-cols-1 gap-6 px-6 pb-3 md:px-10 lg:grid-cols-[280px_1fr_320px]">
          <TimelineRail entries={state.timeline} currentPhase={state.currentPhase} />

          {/* HERO */}
          <section className="flex min-h-0 flex-col gap-4" aria-live="polite" aria-atomic="false">
            <HeroCard
              phase={heroPhase}
              done={state.done}
              elapsed={elapsed}
              progressPct={progressPct}
              completedPhases={completedPhases}
              metrics={state.metrics}
            />
            <ClarifyCard
              clarify={state.clarify}
              onAnswer={() => setState((s) => ({ ...s, clarify: null }))}
            />
            <RecentDecisions decisions={state.decisions} />
          </section>

          <aside className="flex min-h-0 flex-col gap-4">
            <DecisionsPanel decisions={state.decisions} />
            <SourcesPanel sources={state.sources} />
          </aside>
        </div>

        {/* Bottom action bar */}
        <div className="border-outline-variant/70 bg-surface/85 flex items-center justify-between gap-4 border-t px-6 py-3 backdrop-blur md:px-10">
          <div className="text-on-surface-variant flex items-center gap-3 text-[11.5px]">
            <Counter label="tokens" value={(state.metrics.tokens ?? 0).toLocaleString()} />
            <Counter label="cost" value={`$${(state.metrics.costUsd ?? 0).toFixed(2)}`} />
            <Counter label="sources" value={(state.metrics.sources ?? 0).toString()} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-on-surface-variant text-[11px] tabular-nums">
              {progressPct}% · {fmtMs(elapsed)}
            </span>
            {state.done ? (
              <div className="flex items-center gap-2">
                <Link href={`/decide/${id}`} aria-label="Open the design package">
                  <Button
                    variant="filled"
                    className="gap-2 rounded-full px-5 py-2 text-[12.5px] font-semibold"
                  >
                    Open the package <span aria-hidden>→</span>
                  </Button>
                </Link>
                <DownloadButtons md={artifacts.md} pdf={artifacts.pdf} />
              </div>
            ) : (
              <Button
                disabled
                aria-label="The run is still in progress; the package will open here when it's ready."
                className="gap-2 rounded-full px-5 py-2 text-[12.5px] font-semibold disabled:opacity-50"
              >
                Working…
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

/**
 * Renders 1 or 2 download CTAs depending on which artifacts the worker
 * produced. PDF is the primary deliverable when available (it's what
 * users present); MD becomes the secondary tonal button. If only one
 * exists, it's the sole CTA. If neither has landed yet, shows a
 * disabled "Preparing…" placeholder so the layout doesn't shift when
 * the artifacts arrive a tick after the `done` event.
 */
function DownloadButtons({ md, pdf }: { md?: string; pdf?: string }): React.ReactElement {
  if (!md && !pdf) {
    return (
      <Button
        disabled
        aria-label="Preparing your design package…"
        className="gap-2 rounded-full px-5 py-2 text-[12.5px] font-semibold disabled:opacity-50"
      >
        Preparing… <span aria-hidden>↓</span>
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {md ? (
        <a href={md} download>
          <Button
            variant="text"
            className="gap-2 rounded-full px-3 py-2 text-[12.5px] font-medium"
            aria-label="Download the design package as Markdown"
          >
            MD <span aria-hidden>↓</span>
          </Button>
        </a>
      ) : null}
      {pdf ? (
        <a href={pdf} download>
          <Button
            variant="tonal"
            className="gap-2 rounded-full px-3 py-2 text-[12.5px] font-medium"
            aria-label="Download the design package as PDF"
          >
            PDF <span aria-hidden>↓</span>
          </Button>
        </a>
      ) : null}
    </div>
  );
}

function CanvasBackdrop(): React.ReactElement {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 88% 12%, rgb(var(--md-sys-color-primary) / 0.10), transparent 70%), radial-gradient(50% 40% at 10% 92%, rgb(var(--md-sys-color-primary) / 0.06), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--md-sys-color-on-surface)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--md-sys-color-on-surface)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
    </>
  );
}

/** Small connection-state pill in the run header. EventSource auto-retries
 *  on transient drops; this just lets the user see what's happening. */
function ConnPill({
  conn,
}: {
  conn: "connecting" | "live" | "retrying" | "done";
}): React.ReactElement {
  const map: Record<typeof conn, { label: string; cls: string; dot: string; live: string }> = {
    connecting: {
      label: "Connecting",
      cls: "border-outline-variant bg-surface text-on-surface-variant",
      dot: "bg-on-surface-variant/60",
      live: "polite",
    },
    live: {
      label: "Live",
      cls: "border-primary/40 bg-primary/[0.06] text-primary",
      dot: "bg-primary animate-pulse",
      live: "off",
    },
    retrying: {
      label: "Reconnecting…",
      cls: "border-error/40 bg-error/[0.06] text-error",
      dot: "bg-error animate-pulse",
      live: "polite",
    },
    done: {
      label: "Complete",
      cls: "border-primary/40 bg-primary/[0.06] text-primary",
      dot: "bg-primary",
      live: "off",
    },
  };
  const m = map[conn];
  return (
    <span
      role="status"
      aria-live={m.live as "polite" | "off"}
      className={`hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold md:inline-flex ${m.cls}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function SpeedToggle({
  speed,
  onChange,
  done,
}: {
  speed: 1 | 2 | 5;
  onChange: (s: 1 | 2 | 5) => void;
  done: boolean;
}): React.ReactElement {
  return (
    <div
      role="group"
      aria-label="Demo playback speed"
      className={`border-outline-variant bg-surface flex items-center gap-0.5 rounded-full border p-0.5 text-[10.5px] font-semibold ${
        done ? "opacity-50" : ""
      }`}
    >
      {([1, 2, 5] as const).map((s) => (
        <button
          key={s}
          type="button"
          disabled={done}
          onClick={() => onChange(s)}
          aria-pressed={speed === s}
          className={`rounded-full px-2 py-0.5 transition-colors ${
            speed === s
              ? "bg-primary text-on-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {s}×
        </button>
      ))}
    </div>
  );
}

function TimelineRail({
  entries,
  currentPhase,
}: {
  entries: RunState["timeline"];
  currentPhase: Phase | null;
}): React.ReactElement {
  return (
    <aside className="flex min-h-0 flex-col">
      <p className="text-on-surface-variant mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
        Live timeline
      </p>
      <ol
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1"
        aria-live="polite"
        aria-relevant="additions"
      >
        <AnimatePresence initial={false}>
          {entries.map((e) => {
            const isActive = e.status === "started" && currentPhase === e.phase;
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={expressiveDefault}
                className={`bg-surface group flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${
                  isActive ? "border-primary/60 bg-primary/[0.05]" : "border-outline-variant"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-1 size-1.5 shrink-0 rounded-full ${
                    e.status === "completed"
                      ? "bg-primary"
                      : isActive
                        ? "bg-primary animate-pulse"
                        : "bg-on-surface/30"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-on-surface truncate text-[11px] font-semibold">
                    {e.label}
                    <span className="text-on-surface-variant ml-1 text-[10px] font-normal">
                      · {e.status}
                    </span>
                  </p>
                  {e.note ? (
                    <p className="text-on-surface-variant line-clamp-2 text-[10.5px]">{e.note}</p>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </aside>
  );
}

function HeroCard({
  phase,
  done,
  elapsed,
  progressPct,
  completedPhases,
  metrics: _metrics,
}: {
  phase: Phase | null;
  done: boolean;
  elapsed: number;
  progressPct: number;
  completedPhases: number;
  metrics: RunState["metrics"];
}): React.ReactElement {
  const label = done ? "Package ready" : phase ? PHASE_LABELS[phase] : "Connecting…";
  return (
    <section className="border-outline-variant bg-surface/90 rounded-2xl border p-5 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
            {done ? "Done" : "Working"}
          </p>
          <h1 className="text-on-surface mt-1 font-serif text-[26px] leading-tight md:text-[30px]">
            {label}
          </h1>
        </div>
        <div className="text-on-surface-variant text-right text-[11px] tabular-nums">
          <div className="text-[10px] uppercase tracking-wider">Elapsed</div>
          <div className="text-on-surface text-[18px] font-semibold">{fmtMs(elapsed)}</div>
        </div>
      </div>
      <div className="mt-4">
        <WavyProgress value={done ? 100 : progressPct} ariaLabel={`Run progress ${progressPct}%`} />
        <div className="text-on-surface-variant mt-2 flex items-center justify-between text-[10.5px]">
          <span>
            {completedPhases} / {PHASE_ORDER.length} phases
          </span>
          <span className="tabular-nums">{progressPct}%</span>
        </div>
      </div>
    </section>
  );
}

function ClarifyCard({
  clarify,
  onAnswer,
}: {
  clarify: RunState["clarify"];
  onAnswer: () => void;
}): React.ReactElement {
  return (
    <AnimatePresence>
      {clarify ? (
        <motion.section
          key={clarify.id}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={expressiveDefault}
          role="alertdialog"
          aria-labelledby="clarify-q"
          className="border-primary/60 bg-primary/[0.05] rounded-2xl border p-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="bg-primary text-on-primary grid size-6 place-items-center rounded-full text-[11px] font-bold"
            >
              ?
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-primary text-[10px] font-semibold uppercase tracking-wider">
                Quick question
              </p>
              <p id="clarify-q" className="text-on-surface mt-1 text-[13px] font-medium">
                {clarify.question}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {clarify.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={onAnswer}
                    className="border-outline-variant bg-surface text-on-surface hover:border-primary hover:bg-primary/[0.06] hover:text-primary rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

function RecentDecisions({ decisions }: { decisions: RunState["decisions"] }): React.ReactElement {
  // Show the 3 most recent decisions inline in the hero column for a sense
  // of visible progress without reaching for the right panel.
  const last3 = decisions.slice(-3).reverse();
  if (last3.length === 0) return <div className="hidden" aria-hidden />;
  return (
    <section className="flex flex-wrap gap-2">
      <AnimatePresence>
        {last3.map((d) => (
          <motion.span
            key={d.id}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={expressiveFast}
            className="border-primary/40 bg-primary/[0.06] text-on-surface inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold"
          >
            <span aria-hidden className="bg-primary size-1.5 rounded-full" />
            {d.topic}: <span className="text-primary">{d.pick}</span>
          </motion.span>
        ))}
      </AnimatePresence>
    </section>
  );
}

function DecisionsPanel({ decisions }: { decisions: RunState["decisions"] }): React.ReactElement {
  return (
    <section className="border-outline-variant bg-surface/90 flex min-h-0 flex-col rounded-2xl border p-3 backdrop-blur">
      <p className="text-on-surface-variant mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
        Decisions converging
      </p>
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {decisions.map((d) => (
            <motion.li
              key={d.id}
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={expressiveDefault}
              className="border-outline-variant bg-surface rounded-lg border px-2.5 py-1.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-on-surface-variant text-[10.5px] font-semibold uppercase tracking-wider">
                  {d.topic}
                </span>
                <ConfidencePill conf={d.conf} />
              </div>
              <p className="text-primary mt-0.5 text-[11.5px] font-medium">{d.pick}</p>
            </motion.li>
          ))}
          {decisions.length === 0 ? (
            <li className="border-outline-variant text-on-surface-variant rounded-lg border border-dashed px-2.5 py-3 text-center text-[10.5px]">
              Decisions appear here as the agents converge.
            </li>
          ) : null}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function SourcesPanel({ sources }: { sources: RunState["sources"] }): React.ReactElement {
  return (
    <section className="border-outline-variant bg-surface/90 flex min-h-0 flex-1 flex-col rounded-2xl border p-3 backdrop-blur">
      <p className="text-on-surface-variant mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
        Sources consulted
      </p>
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {sources.map((s) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={expressiveFast}
              className="hover:bg-on-surface/[0.04] rounded-lg px-2 py-1.5"
            >
              <p className="text-on-surface truncate text-[11px] font-medium">{s.title}</p>
              <p className="text-on-surface-variant text-[10px]">
                {s.publisher} · #{s.id}
              </p>
            </motion.li>
          ))}
          {sources.length === 0 ? (
            <li className="border-outline-variant text-on-surface-variant rounded-lg border border-dashed px-2.5 py-3 text-center text-[10.5px]">
              Sources stream in here.
            </li>
          ) : null}
        </AnimatePresence>
      </ul>
    </section>
  );
}

// ─── helpers ──────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function useElapsed(startedAt: number | null, done: boolean): number {
  const [now, setNow] = useState<number>(() => Date.now());
  const stopRef = useRef(false);
  useEffect(() => {
    if (done) {
      stopRef.current = true;
      return;
    }
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [done]);
  return startedAt === null ? 0 : now - startedAt;
}
