"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/shell/app-shell";
import { springs } from "@/lib/motion/springs";
import { PRICE_PER_RUN_LABEL } from "@/lib/pricing";

const expressiveDefault = springs.expressiveDefault;
const expressiveFast = springs.expressiveFast;

/* ---------------------------------------------------------------------------
 * /brief — Where a TESSAR run starts.
 *
 * Story: "Tell us about your system, like you&apos;d tell a thoughtful friend."
 * One column, one focus. The brief IS the page.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ TESSAR · new brief                       Theme · Sign in │
 *   ├──────────────────────────────────────────────────────────┤
 *   │                                                          │
 *   │  Tell us what you&apos;re building.                       │
 *   │  A few paragraphs is enough. We&apos;ll ask up to three   │
 *   │  clarifying questions if anything is missing.            │
 *   │                                                          │
 *   │  [Need a starting point?  B2B SaaS · Marketplace · Data] │
 *   │                                                          │
 *   │  ┌──────────────────────────────────────────────────┐    │
 *   │  │  Big writeable area …                             │   │
 *   │  └──────────────────────────────────────────────────┘    │
 *   │  217 words · Strong brief — fewer clarifying questions    │
 *   │                                                          │
 *   │  We&apos;ll likely ask: scope · audience · region        │
 *   │                                                          │
 *   │  ▾ Add structured details (optional, 7 fields)           │
 *   │                                                          │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ $X · ~12 min · PDF + Markdown            Run brief →     │
 *   └──────────────────────────────────────────────────────────┘
 *
 *   - Single column, scrollable. The brief earns the focus.
 *   - Starters: inline chips above the textarea, not a sidebar column.
 *   - Wizard: collapsing &quot;Add structured details&quot; below the brief —
 *     opt-in for users who want to constrain the run.
 *   - Sticky action bar at the bottom: price, est. time, Run button.
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

const TOPIC_LABEL: Record<string, string> = {
  scope: "scope",
  audience: "audience",
  scale: "scale",
  "region/compliance": "region & compliance",
  latency: "latency target",
};

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
  // Clamp to 0–3 (the MVP&apos;s hard cap on clarification questions).
  const count = Math.min(3, topics.length);
  return { count, topics: topics.slice(0, count) };
}

// ─── Page ───────────────────────────────────────────────────────

export default function BriefPage(): React.ReactElement {
  const [brief, setBrief] = useState("");
  const [guide, setGuide] = useState<Guide>(DEFAULT_GUIDE);
  const [seededBy, setSeededBy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = brief.trim().length;
  const wordCount = useMemo(
    () => (brief.trim().length === 0 ? 0 : brief.trim().split(/\s+/).length),
    [brief],
  );
  const clarif = useMemo(() => estimateClarifications(brief, guide), [brief, guide]);

  // Auto-grow the textarea with content. Generous cap so the brief stays the
  // hero even on long inputs; the page itself scrolls past that point.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(220, Math.min(el.scrollHeight, 720))}px`;
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
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const canSubmit = charCount >= 80 && !submitting;
  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
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
      alert("Could not start the run. Try again in a moment.");
    }
  };

  return (
    <AppShell pageLabel="new brief">
      {/* Main column — single, narrow, focused. Page scrolls past the fold. */}
      <main className="relative mx-auto w-full max-w-[760px] px-5 pb-32 pt-10 md:px-8 md:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={expressiveDefault}
        >
          <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
            New brief
          </p>
          <h1 className="text-on-surface mt-2 font-serif text-[34px] leading-[1.05] md:text-[44px]">
            Tell us what you&apos;re building.
          </h1>
          <p className="text-on-surface-variant mt-3 max-w-[58ch] text-[13.5px] leading-relaxed">
            A few paragraphs is enough. We&apos;ll ask up to three clarifying questions if anything
            is missing, and turn it into a researched architecture in about twelve minutes.
          </p>
        </motion.div>

        {/* Starters — inline, compact, opt-in. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...expressiveDefault, delay: 0.05 }}
          className="mt-7 flex flex-wrap items-center gap-2"
        >
          <span className="text-on-surface-variant mr-1 text-[11px]">Need a starting point?</span>
          {EXAMPLES.map((ex) => {
            const active = seededBy === ex.id;
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => seedFromExample(ex)}
                className={`rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant bg-surface text-on-surface-variant hover:border-primary/50 hover:text-primary"
                }`}
              >
                {ex.title}
              </button>
            );
          })}
        </motion.div>

        {/* The brief itself. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...expressiveDefault, delay: 0.1 }}
          className="border-outline-variant bg-surface/95 mt-4 overflow-hidden rounded-2xl border shadow-[0_2px_24px_-12px_rgb(var(--md-sys-color-primary)/0.18)] backdrop-blur"
        >
          <textarea
            ref={textareaRef}
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              if (seededBy !== null) setSeededBy(null);
            }}
            placeholder="e.g. We're building a B2B workflow tool for ops teams. ~5 000 monthly active users at launch, multi-tenant, EU residency required. Each tenant runs ~50 pipelines/day. p95 dashboard latency target: 200 ms…"
            className="text-on-surface placeholder:text-on-surface-variant/60 min-h-[220px] w-full resize-none bg-transparent px-6 py-5 text-[15px] leading-[1.65] focus:outline-none"
            spellCheck
          />
          <div className="border-outline-variant text-on-surface-variant flex flex-wrap items-center justify-between gap-3 border-t px-5 py-2.5 text-[11px]">
            <span className="tabular-nums">
              {wordCount} {wordCount === 1 ? "word" : "words"} · {charCount} chars
            </span>
            <BriefHealth charCount={charCount} />
          </div>
        </motion.div>

        {/* Live clarify hint — what we think we&apos;ll have to ask. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...expressiveDefault, delay: 0.15 }}
          className="text-on-surface-variant mt-4 flex flex-wrap items-center gap-2 text-[12px]"
        >
          {clarif.count === 0 ? (
            <span className="text-primary inline-flex items-center gap-1.5 font-medium">
              <span aria-hidden className="bg-primary size-1.5 rounded-full" />
              We have everything we need.
            </span>
          ) : (
            <>
              <span>We&apos;ll likely ask about</span>
              {clarif.topics.map((t, i) => (
                <span
                  key={t}
                  className="border-outline-variant bg-surface text-on-surface inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                >
                  {TOPIC_LABEL[t] ?? t}
                  {i < clarif.topics.length - 1 ? "" : ""}
                </span>
              ))}
              <span className="text-on-surface-variant/80">
                · up to {clarif.count} short question{clarif.count === 1 ? "" : "s"}
              </span>
            </>
          )}
        </motion.div>

        {/* Optional structured details. Closed by default. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...expressiveDefault, delay: 0.2 }}
          className="mt-8"
        >
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="text-on-surface hover:text-primary group flex items-center gap-2 text-[12.5px] font-semibold"
          >
            <motion.span
              aria-hidden
              animate={{ rotate: detailsOpen ? 90 : 0 }}
              transition={expressiveFast}
              className="text-on-surface-variant inline-block"
            >
              ▸
            </motion.span>
            Add structured details
            <span className="text-on-surface-variant text-[11px] font-normal">
              optional · 7 fields, reduces clarifying questions
            </span>
          </button>

          <AnimatePresence initial={false}>
            {detailsOpen && (
              <motion.div
                key="details"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={expressiveDefault}
                className="overflow-hidden"
              >
                <div className="border-outline-variant bg-surface/70 mt-3 grid gap-5 rounded-2xl border p-5 backdrop-blur md:grid-cols-2">
                  <GuideField label="Domain">
                    <Select
                      options={DOMAIN_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
                      value={guide.domain}
                      onChange={(v) => setGuide({ ...guide, domain: v as DomainChoice })}
                    />
                  </GuideField>
                  <GuideField label="Scale">
                    <Select
                      options={SCALE_OPTIONS.map((o) => ({
                        id: o.id,
                        label: `${o.label} · ${o.sub}`,
                      }))}
                      value={guide.scale}
                      onChange={(v) => setGuide({ ...guide, scale: v as ScaleChoice })}
                    />
                  </GuideField>
                  <GuideField label="Region">
                    <ChipRow
                      options={REGION_OPTIONS}
                      value={guide.region}
                      onChange={(v) => setGuide({ ...guide, region: v as RegionChoice })}
                    />
                  </GuideField>
                  <GuideField label="Cloud preference">
                    <ChipRow
                      options={CLOUD_OPTIONS}
                      value={guide.cloud}
                      onChange={(v) => setGuide({ ...guide, cloud: v as CloudChoice })}
                    />
                  </GuideField>
                  <GuideField label="Compliance">
                    <ChipRow
                      options={COMPLIANCE_OPTIONS}
                      value={guide.compliance}
                      onChange={(v) => setGuide({ ...guide, compliance: v as ComplianceChoice })}
                    />
                  </GuideField>
                  <GuideField label="Latency budget">
                    <ChipRow
                      options={LATENCY_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
                      value={guide.latency}
                      onChange={(v) => setGuide({ ...guide, latency: v as LatencyChoice })}
                    />
                  </GuideField>
                  <GuideField label="Cost stance">
                    <ChipRow
                      options={BUDGET_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
                      value={guide.budget}
                      onChange={(v) => setGuide({ ...guide, budget: v as BudgetChoice })}
                    />
                  </GuideField>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      {/* Sticky action bar — price, est. time, Run button. */}
      <div className="border-outline-variant/70 bg-surface/90 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-4 px-5 py-3 md:px-8">
          <div className="text-on-surface-variant flex items-center gap-3 text-[11.5px]">
            <span className="text-on-surface font-semibold">{PRICE_PER_RUN_LABEL}</span>
            <span aria-hidden>·</span>
            <span>~12 min</span>
            <span aria-hidden className="hidden md:inline">
              ·
            </span>
            <span className="hidden md:inline">PDF + Markdown package</span>
          </div>
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
                  Starting your run…
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
    </AppShell>
  );
}

/* ─── GuideField · Select · ChipRow ─────────────────────────── */

function GuideField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <p className="text-on-surface-variant mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
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
      className="border-outline-variant bg-surface text-on-surface focus:border-primary w-full rounded-lg border px-2.5 py-1.5 text-[12px] font-medium focus:outline-none"
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
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
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

/* ─── BriefHealth ───────────────────────────────────────────── */

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
