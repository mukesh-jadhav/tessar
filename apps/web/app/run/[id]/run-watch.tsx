"use client";

/**
 * <RunWatch /> — the "watching an analyst work" screen.
 *
 * One story: the brief at the top, a single assertive status line of
 * what's happening RIGHT NOW, a mixed live feed of moves the analyst
 * has made (sources read, requirements pinned, components picked,
 * costs computed), and a growing list of decisions on the right —
 * the answer-in-progress.
 *
 * No three-column rail of separate timelines. No loading spinners
 * pretending work is happening. The events ARE the proof of work.
 *
 * When the run finishes, the status line becomes "Done" and the
 * primary CTA flips to opening the package.
 */

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfidencePill } from "@/components/ui/confidence-pill";
import { WhileYouWait } from "@/components/run/while-you-wait";
import {
  PHASE_LABELS,
  PHASE_ORDER,
  type Phase,
  type RecordedEvent,
} from "@/lib/mocks/recorded-run";
import { springs } from "@/lib/motion/springs";
import { estimateRemainingMs, formatEta } from "@/lib/run/eta";

const expressiveDefault = springs.expressiveDefault;

/* ─── Local state machine ────────────────────────────────────── */

type FeedItem =
  | {
      id: string;
      t: number;
      kind: "phase";
      phase: Phase;
      status: "started" | "completed" | "failed";
      note?: string;
    }
  | { id: string; t: number; kind: "source"; n: number; title: string; publisher: string }
  | {
      id: string;
      t: number;
      kind: "decision";
      topic: string;
      pick: string;
      conf: "low" | "med" | "high";
    };

interface State {
  startedAt: number | null;
  phaseStatus: Partial<Record<Phase, "started" | "completed" | "failed">>;
  currentPhase: Phase | null;
  /** Most recent phase note ("5k MAU · EU residency · 200ms p95") to show as the assertion. */
  currentNote: string | null;
  feed: FeedItem[];
  decisions: Array<{
    id: string;
    topic: string;
    pick: string;
    conf: "low" | "med" | "high";
    t: number;
  }>;
  metrics: { tokens: number; costUsd: number; sources: number };
  done: boolean;
  /** Set when the backend terminally fails on a phase. Render the failure UI. */
  failedPhase: Phase | null;
  failureNote: string | null;
}

const INITIAL: State = {
  startedAt: null,
  phaseStatus: {},
  currentPhase: null,
  currentNote: null,
  feed: [],
  decisions: [],
  metrics: { tokens: 0, costUsd: 0, sources: 0 },
  done: false,
  failedPhase: null,
  failureNote: null,
};

function reduce(s: State, ev: RecordedEvent): State {
  switch (ev.kind) {
    case "hello":
      return s.startedAt === null ? { ...s, startedAt: Date.now() } : s;
    case "phase": {
      const { phase, status, note } = ev.payload;
      const id = `phase-${phase}-${status}-${ev.t}`;
      if (s.feed.some((f) => f.id === id)) return s;
      const phaseStatus = { ...s.phaseStatus, [phase]: status };
      // Terminal failure: stop the spinner, show why, surface a retry CTA.
      // Backend `_mark_failed` has already flipped Run.status to failed and
      // emitted this event; we own the visual transition.
      if (status === "failed") {
        return {
          ...s,
          phaseStatus,
          currentPhase: null,
          done: true,
          failedPhase: phase,
          failureNote: note ?? null,
          feed: [...s.feed, { id, t: ev.t, kind: "phase", phase, status, note }],
        };
      }
      const currentPhase =
        status === "started"
          ? phase
          : s.currentPhase === phase
            ? findNextActive(phaseStatus)
            : s.currentPhase;
      // Only completion notes are surfaced as the headline assertion.
      // Mid-phase "started" notes ("8 workers in parallel") describe
      // method, not findings — those live in the feed line.
      const currentNote = status === "completed" && note ? note : s.currentNote;
      return {
        ...s,
        phaseStatus,
        currentPhase,
        currentNote,
        feed: [...s.feed, { id, t: ev.t, kind: "phase", phase, status, note }],
      };
    }
    case "source": {
      const id = `source-${ev.payload.id}`;
      if (s.feed.some((f) => f.id === id)) return s;
      return {
        ...s,
        feed: [
          ...s.feed,
          {
            id,
            t: ev.t,
            kind: "source",
            n: ev.payload.id,
            title: ev.payload.title,
            publisher: ev.payload.publisher,
          },
        ],
      };
    }
    case "decision": {
      const fid = `decision-${ev.payload.id}`;
      if (s.decisions.some((d) => d.id === ev.payload.id)) return s;
      return {
        ...s,
        decisions: [...s.decisions, { ...ev.payload, t: ev.t }],
        feed: [
          ...s.feed,
          {
            id: fid,
            t: ev.t,
            kind: "decision",
            topic: ev.payload.topic,
            pick: ev.payload.pick,
            conf: ev.payload.conf,
          },
        ],
      };
    }
    case "metric":
      return { ...s, metrics: { ...s.metrics, ...ev.payload } };
    case "clarify":
      // Clarifying questions are out-of-scope for autonomous MVP runs
      // (per product-goals: questions surface in the package's open-questions
      // section; we don't pause the run). Ignore.
      return s;
    case "done":
      return { ...s, done: true, currentPhase: null };
  }
}

function findNextActive(
  s: Partial<Record<Phase, "started" | "completed" | "failed">>,
): Phase | null {
  for (const p of PHASE_ORDER) {
    if (s[p] === "started") return p;
  }
  return null;
}

/* ─── Component ──────────────────────────────────────────────── */

interface Props {
  runId: string;
  briefTitle: string;
  briefBody: string;
}

export function RunWatch({ runId, briefTitle, briefBody }: Props): React.ReactElement {
  const [state, setState] = useState<State>(INITIAL);
  const [conn, setConn] = useState<"connecting" | "live" | "retrying" | "done">("connecting");
  const [artifacts, setArtifacts] = useState<{ md?: string; pdf?: string }>({});
  const [briefOpen, setBriefOpen] = useState(false);

  // SSE — same wire format as Phase 1 mocks; real route is /api/runs/[id]/events.
  useEffect(() => {
    setConn("connecting");
    const es = new EventSource(`/api/runs/${runId}/events`);
    es.onopen = () => setConn("live");
    const handler = (msg: MessageEvent<string>): void => {
      try {
        const ev = JSON.parse(msg.data) as RecordedEvent;
        setState((s) => reduce(s, ev));
      } catch {
        // Malformed frame — best-effort stream.
      }
    };
    for (const t of ["hello", "phase", "decision", "source", "metric", "clarify", "done"]) {
      es.addEventListener(t, handler as EventListener);
    }
    es.onerror = () => setConn("retrying");
    return () => es.close();
  }, [runId]);

  // Once done (or on hard-refresh-after-completion), pull the artifact URLs
  // so the CTA can deep-link to MD/PDF without an extra click.
  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          run: { status: string };
          artifacts: Array<{ kind: string; url: string }>;
        };
        if (cancelled) return;
        if (data.run.status === "succeeded" && !state.done) {
          setState((s) => ({ ...s, done: true, currentPhase: null }));
        }
        if (data.run.status === "failed" && !state.failedPhase) {
          // Terminal failure that we missed via SSE (e.g., page opened
          // after the failure event was trimmed). Render the failure UI
          // even without a specific phase pinpoint.
          setState((s) => ({
            ...s,
            done: true,
            currentPhase: null,
            failedPhase: s.currentPhase ?? "architect",
            failureNote: s.failureNote ?? "the run could not be completed",
          }));
        }
        const md = data.artifacts.find((a) => a.kind === "package_md")?.url;
        const pdf = data.artifacts.find((a) => a.kind === "package_pdf")?.url;
        setArtifacts({ md, pdf });
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, state.done, state.failedPhase]);

  useEffect(() => {
    if (state.done) setConn("done");
  }, [state.done]);

  const elapsed = useElapsed(state.startedAt, state.done);
  const completedPhases = useMemo(
    () => PHASE_ORDER.filter((p) => state.phaseStatus[p] === "completed").length,
    [state.phaseStatus],
  );
  const progressPct = Math.round((completedPhases / PHASE_ORDER.length) * 100);
  const etaMs = state.done
    ? 0
    : state.startedAt == null
      ? null
      : estimateRemainingMs(elapsed, completedPhases, PHASE_ORDER.length);
  const etaLabel = formatEta(etaMs);

  // The assertion = the most recent completion note, falling back to the
  // current phase's verb. This is what makes the wait feel like watching
  // an analyst work — the user always knows what JUST happened.
  const assertion = useMemo(() => {
    if (state.failedPhase) {
      const label = PHASE_LABELS[state.failedPhase] ?? state.failedPhase;
      return `${label} couldn’t finish.`;
    }
    if (state.done) return "Done. Your package is ready.";
    if (state.currentNote) return state.currentNote;
    if (state.currentPhase) return PHASE_LABELS[state.currentPhase] + "…";
    return "Connecting to the run…";
  }, [state.done, state.failedPhase, state.currentNote, state.currentPhase]);

  return (
    <div className="bg-surface text-on-surface min-h-dvh w-full">
      {/* Soft brand wash — same canvas language as the rest of the app. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 88% 12%, rgb(var(--md-sys-color-primary) / 0.08), transparent 70%)",
        }}
      />

      {/* Brief context bar — sticky, always echoes what the user asked for. */}
      <BriefBar
        runId={runId}
        title={briefTitle}
        body={briefBody}
        open={briefOpen}
        onToggle={() => setBriefOpen((v) => !v)}
        conn={conn}
      />

      <main className="mx-auto w-full max-w-6xl px-6 pb-12 pt-8 md:px-10">
        {/* The headline — one assertion, one progress line. */}
        <section className="mb-8">
          <p
            className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
              state.failedPhase ? "text-error" : "text-primary"
            }`}
          >
            {state.failedPhase ? "Failed" : state.done ? "Complete" : "Working"}
          </p>
          <h1 className="text-on-surface mt-1 max-w-3xl text-[28px] font-semibold leading-tight md:text-[34px]">
            {assertion}
          </h1>
          <p className="text-on-surface-variant mt-3 text-[13px] tabular-nums">
            {state.failedPhase ? (
              <>
                {state.failureNote ?? "the run was stopped"} · stopped after {fmtMs(elapsed)} · you
                won’t be charged for this run.
              </>
            ) : state.done ? (
              <>
                Finished in {fmtMs(elapsed)} · {state.decisions.length} decision
                {state.decisions.length === 1 ? "" : "s"} made · {state.metrics.sources} sources
                read
              </>
            ) : (
              <>
                {progressPct}% · {fmtMs(elapsed)} elapsed · {state.decisions.length} of ~
                {Math.max(state.decisions.length, 6)} decisions made · {state.metrics.sources}{" "}
                sources read · <span className="text-on-surface">{etaLabel}</span>
              </>
            )}
          </p>
          {/* Progress strip — line, not curve. Easier to read at a glance. */}
          <div
            className="bg-surface-container-low mt-4 h-1 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label="Run progress"
          >
            <motion.div
              className={`${state.failedPhase ? "bg-error" : "bg-primary"} h-full`}
              initial={{ width: 0 }}
              animate={{ width: `${state.done ? 100 : progressPct}%` }}
              transition={expressiveDefault}
            />
          </div>
        </section>

        {/* Editorial “while you wait” cards — educate, don’t fidget. */}
        <WhileYouWait visible={!state.done && !state.failedPhase} className="mb-8" />

        {/* Two columns: live feed + accumulating decisions. */}
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <FeedColumn feed={state.feed} done={state.done} />
          <DecisionsColumn decisions={state.decisions} done={state.done} />
        </div>

        {/* Footer: live counters + primary CTA. */}
        <footer className="border-outline-variant/60 bg-surface/85 sticky bottom-0 z-10 -mx-6 mt-10 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
          <div className="text-on-surface-variant flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] tabular-nums">
            <Stat label="tokens" value={state.metrics.tokens.toLocaleString()} />
            <Stat label="cost" value={`$${state.metrics.costUsd.toFixed(2)}`} />
            <Stat label="sources" value={state.metrics.sources.toString()} />
          </div>
          <div className="flex items-center gap-2">
            {state.failedPhase ? (
              <>
                <span className="text-on-surface-variant text-[11px]">
                  No charge — try a fresh brief.
                </span>
                <Link href="/brief">
                  <Button variant="filled" size="sm" className="gap-2">
                    Start a new run <span aria-hidden>→</span>
                  </Button>
                </Link>
              </>
            ) : state.done ? (
              <>
                {artifacts.md ? (
                  <a href={artifacts.md} download>
                    <Button variant="text" size="sm">
                      Markdown
                    </Button>
                  </a>
                ) : null}
                {artifacts.pdf ? (
                  <a href={artifacts.pdf} download>
                    <Button variant="outlined" size="sm">
                      PDF
                    </Button>
                  </a>
                ) : null}
                <Link href={`/decide/${runId}`}>
                  <Button variant="filled" size="sm" className="gap-2">
                    Open the package <span aria-hidden>→</span>
                  </Button>
                </Link>
              </>
            ) : (
              <span className="text-on-surface-variant text-[11px]">
                The package will open here when it&apos;s ready.
              </span>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────── */

function BriefBar({
  runId,
  title,
  body,
  open,
  onToggle,
  conn,
}: {
  runId: string;
  title: string;
  body: string;
  open: boolean;
  onToggle: () => void;
  conn: "connecting" | "live" | "retrying" | "done";
}): React.ReactElement {
  return (
    <header className="border-outline-variant/60 bg-surface/85 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-3 md:px-10">
        <Link href="/" aria-label="Home" className="flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden
            className="bg-primary text-on-primary grid size-6 place-items-center rounded-full"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M1.5 5.6 L4.2 8 L9 2.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[12px] font-semibold tracking-tight">TESSAR</span>
        </Link>
        <span className="text-on-surface-variant text-[11px]">·</span>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          aria-label="Show full brief"
        >
          <span className="text-on-surface-variant text-[10px] uppercase tracking-wide">
            Your brief
          </span>
          <span className="text-on-surface min-w-0 truncate text-[13px] font-medium">{title}</span>
          <span aria-hidden className="text-on-surface-variant text-[11px]">
            {open ? "▾" : "▸"}
          </span>
        </button>
        <ConnDot conn={conn} />
        <span className="text-on-surface-variant hidden text-[10px] tabular-nums md:inline">
          run #{runId.slice(0, 7)}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expressiveDefault}
            className="overflow-hidden"
          >
            <div className="border-outline-variant/40 mx-auto max-w-6xl border-t px-6 py-4 md:px-10">
              <p className="text-on-surface max-w-3xl whitespace-pre-line text-[13px] leading-relaxed">
                {body || "(brief unavailable)"}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function ConnDot({
  conn,
}: {
  conn: "connecting" | "live" | "retrying" | "done";
}): React.ReactElement {
  const map: Record<typeof conn, { cls: string; pulse: boolean; label: string }> = {
    connecting: { cls: "bg-on-surface-variant/60", pulse: true, label: "Connecting" },
    live: { cls: "bg-primary", pulse: true, label: "Live" },
    retrying: { cls: "bg-error", pulse: true, label: "Reconnecting" },
    done: { cls: "bg-primary", pulse: false, label: "Complete" },
  };
  const m = map[conn];
  return (
    <span
      role="status"
      title={m.label}
      aria-label={m.label}
      className={`inline-flex size-2 shrink-0 rounded-full ${m.cls} ${m.pulse ? "animate-pulse" : ""}`}
    />
  );
}

function FeedColumn({ feed, done }: { feed: FeedItem[]; done: boolean }): React.ReactElement {
  // Auto-scroll to the bottom of the feed as new items arrive — but only
  // if the user is already near the bottom. Otherwise they're reading
  // history and we shouldn't yank them away.
  const ref = useRef<HTMLOListElement | null>(null);
  const lastLen = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (feed.length <= lastLen.current) {
      lastLen.current = feed.length;
      return;
    }
    lastLen.current = feed.length;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [feed.length]);

  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wide">
          What we&apos;re doing
        </h2>
        {!done ? <span className="text-on-surface-variant text-[10px]">live</span> : null}
      </header>
      <ol
        ref={ref}
        aria-live="polite"
        aria-relevant="additions"
        className="border-outline-variant/60 bg-surface-container-low/40 max-h-[60vh] min-h-[280px] space-y-2 overflow-y-auto rounded-2xl border p-4"
      >
        <AnimatePresence initial={false}>
          {feed.length === 0 ? (
            <motion.li
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-on-surface-variant text-[12px]"
            >
              Waiting for the first move…
            </motion.li>
          ) : (
            feed.map((item) => <FeedRow key={item.id} item={item} />)
          )}
        </AnimatePresence>
      </ol>
    </section>
  );
}

function FeedRow({ item }: { item: FeedItem }): React.ReactElement {
  return (
    <motion.li
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={expressiveDefault}
      className="flex items-start gap-3 text-[12.5px] leading-snug"
    >
      <span className="text-on-surface-variant w-12 shrink-0 pt-0.5 text-right text-[10px] tabular-nums opacity-70">
        {fmtMs(item.t)}
      </span>
      <FeedIcon item={item} />
      <FeedBody item={item} />
    </motion.li>
  );
}

function FeedIcon({ item }: { item: FeedItem }): React.ReactElement {
  if (item.kind === "decision") {
    return (
      <span
        aria-hidden
        className="bg-primary text-on-primary mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold"
      >
        ✓
      </span>
    );
  }
  if (item.kind === "source") {
    return (
      <span
        aria-hidden
        className="bg-tertiary-container text-on-tertiary-container mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-semibold tabular-nums"
      >
        {item.n}
      </span>
    );
  }
  // phase
  if (item.status === "failed") {
    return <span aria-hidden className="bg-error mt-1.5 size-1.5 shrink-0 rounded-full" />;
  }
  const completed = item.status === "completed";
  return (
    <span
      aria-hidden
      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
        completed ? "bg-primary" : "bg-primary/60 animate-pulse"
      }`}
    />
  );
}

function FeedBody({ item }: { item: FeedItem }): React.ReactElement {
  if (item.kind === "phase") {
    const verb =
      item.status === "started" ? "Starting" : item.status === "failed" ? "Failed" : "Done";
    return (
      <div className="min-w-0 flex-1">
        <p className="text-on-surface">
          <span
            className={`text-[11px] uppercase tracking-wide ${
              item.status === "failed" ? "text-error" : "text-on-surface-variant"
            }`}
          >
            {verb}:
          </span>{" "}
          {PHASE_LABELS[item.phase]}
        </p>
        {item.note ? (
          <p className="text-on-surface-variant mt-0.5 text-[11.5px]">{item.note}</p>
        ) : null}
      </div>
    );
  }
  if (item.kind === "source") {
    return (
      <div className="min-w-0 flex-1">
        <p className="text-on-surface truncate">
          <span className="text-on-surface-variant text-[11px] uppercase tracking-wide">Read:</span>{" "}
          {item.title}
        </p>
        <p className="text-on-surface-variant text-[11px]">{item.publisher}</p>
      </div>
    );
  }
  // decision
  return (
    <div className="min-w-0 flex-1">
      <p className="text-on-surface">
        <span className="text-on-surface-variant text-[11px] uppercase tracking-wide">Picked:</span>{" "}
        <span className="font-semibold">{item.pick}</span>
      </p>
      <p className="text-on-surface-variant text-[11px]">for {item.topic}</p>
    </div>
  );
}

function DecisionsColumn({
  decisions,
  done,
}: {
  decisions: State["decisions"];
  done: boolean;
}): React.ReactElement {
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wide">
          The answer so far
        </h2>
        <span className="text-on-surface-variant text-[10px] tabular-nums">
          {decisions.length} pick{decisions.length === 1 ? "" : "s"}
        </span>
      </header>
      <ol
        aria-live="polite"
        aria-relevant="additions"
        className="border-outline-variant/60 bg-surface-container-low/40 max-h-[60vh] min-h-[280px] space-y-2 overflow-y-auto rounded-2xl border p-4"
      >
        <AnimatePresence initial={false}>
          {decisions.length === 0 ? (
            <motion.li
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-on-surface-variant text-[12px]"
            >
              {done
                ? "No decisions were emitted for this run."
                : "Decisions will appear here as the analyst commits to picks."}
            </motion.li>
          ) : (
            decisions.map((d) => (
              <motion.li
                key={d.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={expressiveDefault}
                className="border-outline-variant/40 bg-surface flex items-start justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-on-surface-variant text-[10px] uppercase tracking-wide">
                    {d.topic}
                  </p>
                  <p className="text-on-surface mt-0.5 truncate text-[13px] font-semibold">
                    {d.pick}
                  </p>
                </div>
                <ConfidencePill conf={d.conf} />
              </motion.li>
            ))
          )}
        </AnimatePresence>
      </ol>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-on-surface font-semibold">{value}</span>
      <span className="text-on-surface-variant text-[10px] uppercase tracking-wide">{label}</span>
    </span>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${(s % 60).toString().padStart(2, "0")}s` : `${s}s`;
}

function useElapsed(startedAt: number | null, done: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (done || startedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [done, startedAt]);
  return startedAt == null ? 0 : now - startedAt;
}
