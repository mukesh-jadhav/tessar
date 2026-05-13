"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { springs } from "@/lib/motion/springs";
import { PRICE_PER_RUN_LABEL } from "@/lib/pricing";

const expressiveDefault = springs.expressiveDefault;
const expressiveFast = springs.expressiveFast;

/* ---------------------------------------------------------------------------
 * /brief — Where a TESSAR run starts.
 *
 * Single viewport, no scroll. Three columns at lg+:
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ ✓ TESSAR                              theme · sign-in (floating)    │
 *   ├─────────────┬───────────────────────────────────┬───────────────────┤
 *   │ EXAMPLES    │   THE BRIEF                       │   GUIDE ME        │
 *   │ 3 starters  │   huge expressive textarea        │   wizard fields   │
 *   │             │   live readout                    │   (optional)      │
 *   ├─────────────┴───────────────────────────────────┴───────────────────┤
 *   │ live read    "we'll likely ask · X clarifying questions"   [Run →]  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 *   - The textarea is the hero. Everything else exists to support it.
 *   - "Guide me" chips compose into prefix lines that get prepended to the
 *     brief on submit (so users still see exactly what TESSAR will read).
 *   - Examples seed the textarea AND set matching guide chips, so the user
 *     can immediately see the shape of a "good" brief.
 * ------------------------------------------------------------------------- */

// ─── Example briefs ─────────────────────────────────────────────

type Example = {
  id: string;
  title: string;
  body: string;
  scale: ScaleChoice;
  domain: DomainChoice;
  region: RegionChoice;
  cloud: CloudChoice;
  compliance: ComplianceChoice;
};

const EXAMPLES: Example[] = [
  {
    id: "saas",
    title: "B2B SaaS · multi-tenant",
    body: "We're building a workflow automation tool for ops teams at mid-market SaaS companies. Users design pipelines visually, hit run, see results stream in. We expect 5 000 monthly active users at launch, with each tenant running ~50 pipelines/day. Pipelines integrate with Slack, Stripe, and a customer's own DB via outbound webhooks. We'd like to keep p95 dashboard latency under 200 ms.",
    scale: "growing",
    domain: "b2b",
    region: "global",
    cloud: "any",
    compliance: "soc2",
  },
  {
    id: "marketplace",
    title: "Two-sided marketplace",
    body: "Marketplace connecting freelance designers with small businesses. Buyers post briefs, designers bid, payments held in escrow until delivery. Aim for 20k buyers and 5k designers in year 1; ~1k transactions/day. Need search across designer portfolios, real-time chat, and Stripe Connect for payouts. EU customers, so GDPR matters.",
    scale: "small",
    domain: "marketplace",
    region: "eu",
    cloud: "any",
    compliance: "gdpr",
  },
  {
    id: "events",
    title: "High-volume event ingest",
    body: "Backend for a mobile analytics SDK. Each customer's app sends ~10M product events/day; we need to land them, deduplicate, and let customers query the last 30 days from a dashboard. ~200 customers projected by month 6. Ingest must be lossless under bursts; queries can be eventually consistent.",
    scale: "large",
    domain: "data",
    region: "us",
    cloud: "any",
    compliance: "none",
  },
];

// ─── Guide-me wizard choices ────────────────────────────────────

type DomainChoice = "b2b" | "b2c" | "marketplace" | "data" | "internal" | "other";
type ScaleChoice = "small" | "growing" | "large" | "huge";
type RegionChoice = "us" | "eu" | "asia" | "global";
type CloudChoice = "any" | "gcp" | "aws" | "azure";
type ComplianceChoice = "none" | "gdpr" | "hipaa" | "soc2" | "pci";
type LatencyChoice = "relaxed" | "standard" | "tight";
type BudgetChoice = "lean" | "standard" | "generous";

type Guide = {
  domain: DomainChoice;
  scale: ScaleChoice;
  region: RegionChoice;
  cloud: CloudChoice;
  compliance: ComplianceChoice;
  latency: LatencyChoice;
  budget: BudgetChoice;
};

const DEFAULT_GUIDE: Guide = {
  domain: "b2b",
  scale: "growing",
  region: "global",
  cloud: "any",
  compliance: "none",
  latency: "standard",
  budget: "standard",
};

const DOMAIN_OPTIONS: Array<{ id: DomainChoice; label: string; sub: string }> = [
  { id: "b2b", label: "B2B SaaS", sub: "Companies as customers" },
  { id: "b2c", label: "B2C app", sub: "Consumers as users" },
  { id: "marketplace", label: "Marketplace", sub: "Two-sided network" },
  { id: "data", label: "Data / ML", sub: "Ingest + analytics" },
  { id: "internal", label: "Internal tool", sub: "One-org workflow" },
  { id: "other", label: "Something else", sub: "Tell us in the brief" },
];
const SCALE_OPTIONS: Array<{ id: ScaleChoice; label: string; sub: string }> = [
  { id: "small", label: "Small", sub: "≤ 1k users" },
  { id: "growing", label: "Growing", sub: "1k – 50k users" },
  { id: "large", label: "Large", sub: "50k – 1M users" },
  { id: "huge", label: "Huge", sub: "1M+ or > 10k RPS" },
];
const REGION_OPTIONS: Array<{ id: RegionChoice; label: string }> = [
  { id: "us", label: "US" },
  { id: "eu", label: "EU" },
  { id: "asia", label: "Asia" },
  { id: "global", label: "Global" },
];
const CLOUD_OPTIONS: Array<{ id: CloudChoice; label: string }> = [
  { id: "any", label: "No preference" },
  { id: "gcp", label: "GCP" },
  { id: "aws", label: "AWS" },
  { id: "azure", label: "Azure" },
];
const COMPLIANCE_OPTIONS: Array<{ id: ComplianceChoice; label: string }> = [
  { id: "none", label: "None for MVP" },
  { id: "gdpr", label: "GDPR" },
  { id: "hipaa", label: "HIPAA" },
  { id: "soc2", label: "SOC 2" },
  { id: "pci", label: "PCI-DSS" },
];
const LATENCY_OPTIONS: Array<{ id: LatencyChoice; label: string; sub: string }> = [
  { id: "relaxed", label: "Relaxed", sub: "< 1 s p95" },
  { id: "standard", label: "Standard", sub: "< 300 ms p95" },
  { id: "tight", label: "Tight", sub: "< 100 ms p95" },
];
const BUDGET_OPTIONS: Array<{ id: BudgetChoice; label: string; sub: string }> = [
  { id: "lean", label: "Lean", sub: "Minimize spend" },
  { id: "standard", label: "Standard", sub: "Balance cost & speed" },
  { id: "generous", label: "Generous", sub: "Optimize for time-to-market" },
];

// ─── Heuristic: how many clarifying questions will we ask? ──────

function estimateClarifications(
  brief: string,
  guide: Guide,
): {
  count: number;
  topics: string[];
} {
  const len = brief.trim().length;
  const topics: string[] = [];
  if (len < 200) topics.push("scope");
  if (!/\b(user|tenant|customer)\b/i.test(brief)) topics.push("audience");
  if (!/\b(req|rps|event|traffic|users|month)\b/i.test(brief)) topics.push("scale");
  if (
    !/\b(eu|us|asia|region|residency|gdpr|hipaa|pci|soc)\b/i.test(brief) &&
    guide.compliance === "none"
  ) {
    topics.push("region/compliance");
  }
  if (!/\b(latency|ms|p95|real-time|near-real)\b/i.test(brief) && guide.latency === "standard") {
    topics.push("latency");
  }
  // Clamp to 0–3 (the MVP's hard cap on clarification questions).
  const count = Math.min(3, topics.length);
  return { count, topics: topics.slice(0, count) };
}

// ─── Page ───────────────────────────────────────────────────────

export default function BriefPage(): React.ReactElement {
  const [brief, setBrief] = useState("");
  const [guide, setGuide] = useState<Guide>(DEFAULT_GUIDE);
  const [seededBy, setSeededBy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = brief.trim().length;
  const wordCount = useMemo(
    () => (brief.trim().length === 0 ? 0 : brief.trim().split(/\s+/).length),
    [brief],
  );
  const clarif = useMemo(() => estimateClarifications(brief, guide), [brief, guide]);

  // Keep textarea growing with content, capped so the layout never breaks.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, [brief]);

  const seedFromExample = (ex: Example): void => {
    setBrief(ex.body);
    setGuide({
      ...DEFAULT_GUIDE,
      domain: ex.domain,
      scale: ex.scale,
      region: ex.region,
      cloud: ex.cloud,
      compliance: ex.compliance,
    });
    setSeededBy(ex.id);
    // Refocus the textarea so users feel they can keep editing.
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const canSubmit = charCount >= 80 && !submitting;
  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Phase 2: real intake. POST /api/runs creates the row + publishes
      // to Pub/Sub; we then jump to the run-progress page which will tail
      // RunEvent rows (SSE wiring lands in the next slice). Phase 4 will
      // insert Stripe Checkout between the create and the redirect.
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief, guide }),
      });
      if (res.status === 401) {
        window.location.href = `/signin?from=${encodeURIComponent("/brief")}`;
        return;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`POST /api/runs ${res.status}: ${detail}`);
      }
      const { runId } = (await res.json()) as { runId: string };
      window.location.href = `/run/${runId}`;
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      // Soft-fail UX: keep the user on the page so they can retry without
      // losing the brief. A toast/inline error lands when we add the
      // shared notification component.
      alert("Could not start the run. Try again in a moment.");
    }
  };

  return (
    <div className="bg-surface text-on-surface relative h-dvh w-screen overflow-hidden">
      {/* Soft brand wash + hairline grid — same canvas language as / and /decide. */}
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

      {/* Floating top chrome */}
      <div className="absolute left-6 top-5 z-20 flex items-center gap-2.5 md:left-10 md:top-7">
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
        <span className="text-on-surface-variant ml-2 hidden text-[11px] md:inline">· new run</span>
      </div>
      <div className="absolute right-6 top-5 z-20 flex items-center gap-2 md:right-10 md:top-7">
        <ThemeToggle />
        <Link
          href="/"
          className="text-on-surface-variant hover:text-on-surface rounded-full px-3 py-1.5 text-[11.5px] font-semibold"
        >
          Sign in
        </Link>
      </div>

      {/* Main grid — three columns at lg+, stacks down at smaller widths. */}
      <main className="absolute inset-0 grid grid-rows-[1fr_auto] pt-20">
        <div className="grid min-h-0 grid-cols-1 gap-6 px-6 pb-3 md:px-10 lg:grid-cols-[260px_1fr_320px]">
          {/* LEFT — Examples */}
          <ExamplesRail examples={EXAMPLES} seededBy={seededBy} onPick={seedFromExample} />

          {/* CENTER — The brief */}
          <section className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
                  The brief
                </p>
                <h1 className="text-on-surface mt-1 font-serif text-[28px] leading-tight md:text-[34px]">
                  Describe the system you want to build.
                </h1>
                <p className="text-on-surface-variant mt-1 text-[12.5px]">
                  A few paragraphs is enough. We&apos;ll ask up to three clarifying questions if
                  anything is missing.
                </p>
              </div>
            </div>

            <div className="border-outline-variant bg-surface/90 relative flex min-h-0 flex-1 flex-col rounded-2xl border backdrop-blur">
              <textarea
                ref={textareaRef}
                value={brief}
                onChange={(e) => {
                  setBrief(e.target.value);
                  if (seededBy !== null) setSeededBy(null);
                }}
                placeholder="e.g. We're building a B2B workflow tool for ops teams. ~5 000 monthly active users at launch, multi-tenant, EU residency required. Each tenant runs ~50 pipelines/day. p95 dashboard latency target: 200 ms…"
                className="text-on-surface placeholder:text-on-surface-variant/60 min-h-[180px] flex-1 resize-none rounded-2xl bg-transparent px-5 py-4 text-[14px] leading-relaxed focus:outline-none"
                spellCheck
              />
              {/* Live readout strip */}
              <div className="border-outline-variant text-on-surface-variant flex items-center justify-between gap-3 border-t px-4 py-2 text-[10.5px]">
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">
                    {wordCount} words · {charCount} chars
                  </span>
                  <BriefHealth charCount={charCount} />
                </div>
                <ClarifyChip count={clarif.count} topics={clarif.topics} />
              </div>
            </div>
          </section>

          {/* RIGHT — Guide-me wizard */}
          <GuidePanel guide={guide} onChange={setGuide} />
        </div>

        {/* Bottom action bar — fixed-height row, never scrolls. */}
        <div className="border-outline-variant/70 bg-surface/85 flex items-center justify-between gap-4 border-t px-6 py-3 backdrop-blur md:px-10">
          <div className="text-on-surface-variant flex items-center gap-3 text-[11.5px]">
            <span className="hidden md:inline">
              Each run takes about <span className="text-on-surface font-semibold">12 min</span> ·
              produces a PDF + Markdown package.
            </span>
            <span className="md:hidden">~12 min · PDF + MD</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-on-surface-variant text-[11px] font-semibold uppercase tracking-wider">
              {PRICE_PER_RUN_LABEL} / run
            </span>
            <Button
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="gap-2 rounded-full px-5 py-2 text-[12.5px] font-semibold disabled:opacity-50"
            >
              <AnimatePresence mode="wait" initial={false}>
                {submitting ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={expressiveFast}
                    className="flex items-center gap-2"
                  >
                    <span
                      aria-hidden
                      className="border-on-primary size-3 animate-spin rounded-full border-[1.5px] border-t-transparent"
                    />
                    Handing off to Stripe…
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={expressiveFast}
                    className="flex items-center gap-1.5"
                  >
                    Run brief
                    <span aria-hidden>→</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─── ExamplesRail ──────────────────────────────────────────── */

function ExamplesRail({
  examples,
  seededBy,
  onPick,
}: {
  examples: Example[];
  seededBy: string | null;
  onPick: (ex: Example) => void;
}): React.ReactElement {
  return (
    <aside className="flex min-h-0 flex-col gap-3">
      <div>
        <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
          Examples
        </p>
        <p className="text-on-surface-variant mt-1 text-[11.5px]">
          Click one to seed the brief. Edit freely afterwards.
        </p>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {examples.map((ex, i) => {
          const active = seededBy === ex.id;
          return (
            <li key={ex.id}>
              <motion.button
                type="button"
                onClick={() => onPick(ex)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...expressiveDefault, delay: i * 0.05 }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className={`bg-surface group flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary/[0.05]"
                    : "border-outline-variant hover:border-primary/50"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold ${
                    active
                      ? "bg-primary text-on-primary"
                      : "bg-on-surface/[0.06] text-on-surface-variant group-hover:bg-primary/15 group-hover:text-primary"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-on-surface text-[11.5px] font-semibold">{ex.title}</p>
                  <p className="text-on-surface-variant mt-0.5 line-clamp-3 text-[11px] leading-snug">
                    {ex.body}
                  </p>
                </div>
              </motion.button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/* ─── GuidePanel ───────────────────────────────────────────── */

function GuidePanel({
  guide,
  onChange,
}: {
  guide: Guide;
  onChange: (g: Guide) => void;
}): React.ReactElement {
  const set = <K extends keyof Guide>(k: K, v: Guide[K]): void => onChange({ ...guide, [k]: v });
  return (
    <aside className="flex min-h-0 flex-col gap-3">
      <div>
        <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
          Guide me
        </p>
        <p className="text-on-surface-variant mt-1 text-[11.5px]">
          Optional. Setting these reduces clarifying questions.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <GuideField label="Domain">
          <Select
            options={DOMAIN_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={guide.domain}
            onChange={(v) => set("domain", v as DomainChoice)}
          />
        </GuideField>
        <GuideField label="Scale">
          <Select
            options={SCALE_OPTIONS.map((o) => ({ id: o.id, label: `${o.label} · ${o.sub}` }))}
            value={guide.scale}
            onChange={(v) => set("scale", v as ScaleChoice)}
          />
        </GuideField>
        <GuideField label="Region">
          <ChipRow
            options={REGION_OPTIONS}
            value={guide.region}
            onChange={(v) => set("region", v as RegionChoice)}
          />
        </GuideField>
        <GuideField label="Cloud preference">
          <ChipRow
            options={CLOUD_OPTIONS}
            value={guide.cloud}
            onChange={(v) => set("cloud", v as CloudChoice)}
          />
        </GuideField>
        <GuideField label="Compliance">
          <ChipRow
            options={COMPLIANCE_OPTIONS}
            value={guide.compliance}
            onChange={(v) => set("compliance", v as ComplianceChoice)}
          />
        </GuideField>
        <GuideField label="Latency budget">
          <ChipRow
            options={LATENCY_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={guide.latency}
            onChange={(v) => set("latency", v as LatencyChoice)}
          />
        </GuideField>
        <GuideField label="Cost stance">
          <ChipRow
            options={BUDGET_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={guide.budget}
            onChange={(v) => set("budget", v as BudgetChoice)}
          />
        </GuideField>
      </div>
    </aside>
  );
}

function GuideField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <p className="text-on-surface-variant mb-1 text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
      {children}
    </div>
  );
}

function Select({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-outline-variant bg-surface text-on-surface focus:border-primary w-full rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
              active
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant bg-surface text-on-surface-variant hover:border-primary/50 hover:text-primary"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── BriefHealth + ClarifyChip ────────────────────────────── */

function BriefHealth({ charCount }: { charCount: number }): React.ReactElement {
  // Three states: too short → start → strong.
  const state = charCount < 80 ? "short" : charCount < 240 ? "ok" : "strong";
  const dot =
    state === "short" ? "bg-on-surface/30" : state === "ok" ? "bg-primary/60" : "bg-primary";
  const label =
    state === "short"
      ? "Add a bit more — describe scale & audience"
      : state === "ok"
        ? "Looks good — we can run this"
        : "Strong brief — fewer clarifying questions";
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
    </span>
  );
}

function ClarifyChip({ count, topics }: { count: number; topics: string[] }): React.ReactElement {
  return (
    <span
      title={count === 0 ? "We have everything we need." : `Likely topics: ${topics.join(", ")}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        count === 0
          ? "border-primary/40 bg-primary/[0.06] text-primary"
          : "border-outline-variant bg-surface text-on-surface-variant"
      }`}
    >
      <span aria-hidden>?</span>
      {count === 0
        ? "No clarifying questions expected"
        : `~${count} clarifying question${count === 1 ? "" : "s"}`}
    </span>
  );
}
