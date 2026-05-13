"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { springs } from "@/lib/motion/springs";

const expressiveDefault = springs.expressiveDefault;

/* ---------------------------------------------------------------------------
 * TESSAR landing — true full-bleed canvas, no scroll, no header strip.
 *
 * Layout (fills the entire viewport edge-to-edge):
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ ✓ TESSAR  (floating)              nav · theme · sign-in (floating)   │
 *   │                                                                      │
 *   │   EYEBROW                                                            │
 *   │   Decide what to build.                ┌──────────────────────────┐  │
 *   │   In about 12 minutes.                 │  SPECIMEN PANEL           │ │
 *   │                                        │  one design package        │ │
 *   │   [paragraph]                          │  cycling every 6 s         │ │
 *   │                                        │   - brief                  │ │
 *   │   [ Start a brief → ] · See sample     │   - mini diagram           │ │
 *   │                                        │   - recommended pick       │ │
 *   │                                        │   - cost · sources         │ │
 *   │                                        └──────────────────────────┘  │
 *   │ stats inline (bottom-left, floating)   footer links inline (right)   │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 *   - No bordered top-bar strip; brand mark + actions float in corners.
 *   - No bordered footer strip; meta info floats in opposing corners.
 *   - Background is a soft radial wash of the brand primary so the canvas
 *     never reads as a flat grey rectangle.
 * ------------------------------------------------------------------------- */

type Spec = {
  id: string;
  brief: string;
  scale: string;
  region: string;
  pick: { service: string; vs: string };
  cost: string;
  sources: number;
};

const SPECIMENS: Spec[] = [
  {
    id: "saas",
    brief: "B2B SaaS that ingests ~10M product events/day and bills monthly.",
    scale: "10M events/day · multi-tenant",
    region: "EU residency",
    pick: { service: "Cloud SQL Postgres + pgvector", vs: "vs AlloyDB · DynamoDB" },
    cost: "$184 / mo idle · $1,910 at 10×",
    sources: 14,
  },
  {
    id: "ocr",
    brief: "Invoice OCR pipeline for GST e-invoices, < $0.04 per document.",
    scale: "120k docs / mo",
    region: "asia-south1",
    pick: { service: "Vertex Vision + Document AI", vs: "vs Textract · Azure FR" },
    cost: "$0.031 / doc · $3,720 / mo",
    sources: 11,
  },
  {
    id: "analytics",
    brief: "Usage analytics for a developer tool, 90-day hot retention.",
    scale: "10M events / day · 90d hot",
    region: "us-central1",
    pick: { service: "ClickHouse on GCE + BigQuery cold", vs: "vs BigQuery only" },
    cost: "$612 / mo · 6× cheaper / event",
    sources: 17,
  },
];

export default function LandingPage(): React.ReactElement {
  const [specIdx, setSpecIdx] = useState(0);

  // Cycle the specimen panel every 6 s so the page is never visually static.
  useEffect(() => {
    const t = setInterval(() => setSpecIdx((i) => (i + 1) % SPECIMENS.length), 6000);
    return () => clearInterval(t);
  }, []);

  const spec = SPECIMENS[specIdx]!;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-surface text-on-surface">
      {/* Soft radial brand wash — keeps the canvas alive without a header strip. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 88% 12%, rgb(var(--md-sys-color-primary) / 0.10), transparent 70%), radial-gradient(50% 40% at 10% 92%, rgb(var(--md-sys-color-primary) / 0.06), transparent 70%)",
        }}
      />
      {/* Hairline grid ghost — visible in dark, near-invisible in light. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--md-sys-color-on-surface)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--md-sys-color-on-surface)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      {/* FLOATING TOP CHROME — brand left, nav right ───────────────── */}
      <div className="absolute left-6 top-5 z-20 flex items-center gap-2.5 md:left-10 md:top-7">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full bg-primary text-on-primary shadow-[0_4px_14px_-6px_rgb(var(--md-sys-color-primary)/0.5)]"
          >
            <svg width="12" height="12" viewBox="0 0 11 11" fill="none">
              <path
                d="M2 5.7L4.3 8L9 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">TESSAR</span>
        </Link>
      </div>

      <div className="absolute right-6 top-5 z-20 flex items-center gap-1 md:right-10 md:top-7">
        <nav className="hidden items-center gap-1 md:flex" aria-label="primary">
          <Link
            href="/decide"
            className="rounded-full px-3 py-1.5 text-sm text-on-surface-variant transition-colors hover:bg-on-surface/5 hover:text-on-surface"
          >
            How it works
          </Link>
          <Link
            href="/decide"
            className="rounded-full px-3 py-1.5 text-sm text-on-surface-variant transition-colors hover:bg-on-surface/5 hover:text-on-surface"
          >
            Sample
          </Link>
          <Link
            href="/checkout"
            className="rounded-full px-3 py-1.5 text-sm text-on-surface-variant transition-colors hover:bg-on-surface/5 hover:text-on-surface"
          >
            Pricing
          </Link>
        </nav>
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-outline-variant md:block" />
        <ThemeToggle />
        <Link
          href="/signin"
          className="ml-1 hidden rounded-full px-3 py-1.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-on-surface/5 hover:text-on-surface md:inline"
        >
          Sign in
        </Link>
      </div>

      {/* MAIN STAGE — true edge-to-edge ─────────────────────────── */}
      <main className="relative z-10 grid h-full w-full grid-cols-1 items-center gap-10 px-6 pb-24 pt-24 md:grid-cols-12 md:gap-12 md:px-14 md:pb-28 md:pt-28">
        {/* LEFT — editorial pitch (no card chrome) */}
        <section className="md:col-span-7 md:pr-4 xl:col-span-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-outline-variant bg-surface/80 px-3 py-1 text-xs font-medium tracking-wide text-on-surface-variant backdrop-blur">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            System design, decided
          </span>

          <h1 className="mt-7 text-balance text-[44px] font-extrabold leading-[1.02] tracking-tight md:text-[64px] xl:text-[80px]">
            Decide what to build.
            <span className="block text-primary">In about 12 minutes.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-on-surface-variant md:text-lg">
            Most architecture advice is opinion. Every reference design hides its assumptions. A
            chatbot just guesses with confidence. We{" "}
            <span className="font-semibold text-on-surface">read the open web for you</span>{" "}
            &mdash; cross-checked against a curated knowledge base, every claim grounded in a
            source you can open.
          </p>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-on-surface-variant">
            <li className="inline-flex items-center gap-2">
              <Check /> Not a chatbot guess
            </li>
            <li className="inline-flex items-center gap-2">
              <Check /> Source-cited, always
            </li>
            <li className="inline-flex items-center gap-2">
              <Check /> One named architecture
            </li>
          </ul>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/brief">
              <Button variant="filled" size="lg" className="px-7 text-[15px]">
                Start a brief &rarr;
              </Button>
            </Link>
            <Link
              href="/decide"
              className="text-sm font-medium text-on-surface-variant underline-offset-4 hover:text-on-surface hover:underline"
            >
              See a sample package
            </Link>
          </div>
        </section>

        {/* RIGHT — living specimen ─────────────────────────────── */}
        <aside className="md:col-span-5 md:pl-4 xl:col-span-6 xl:pl-16">
          <SpecimenPanel spec={spec} index={specIdx} count={SPECIMENS.length} />
        </aside>
      </main>

      {/* FLOATING BOTTOM CHROME — stats left, links right ─────────── */}
      <div className="absolute bottom-5 left-6 z-20 flex items-end gap-6 text-sm text-on-surface-variant md:bottom-7 md:left-14">
        <Stat n="1,247" label="designs today" />
        <span aria-hidden className="hidden h-8 w-px bg-outline-variant md:block" />
        <Stat n="39%" label="rejected the obvious" />
        <span aria-hidden className="hidden h-8 w-px bg-outline-variant md:block" />
        <Stat n="9" label="agents per run" />
      </div>

      <div className="absolute bottom-6 right-6 z-20 hidden items-center gap-5 text-xs text-on-surface-variant md:bottom-8 md:right-14 md:flex">
        <Link href="/design-system" className="hover:text-on-surface">
          Design system
        </Link>
        <Link href="/decide" className="hover:text-on-surface">
          How we cite
        </Link>
        <span
          aria-hidden
          title="Privacy policy lives at launch"
          className="cursor-default text-on-surface-variant/60"
        >
          Privacy · soon
        </span>
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
      </div>
    </div>
  );
}

/* ─── Specimen panel — cycling proof of one designed package ───── */

function SpecimenPanel({
  spec,
  index,
  count,
}: {
  spec: Spec;
  index: number;
  count: number;
}): React.ReactElement {
  return (
    <div className="relative w-full">
      <div className="relative overflow-hidden rounded-3xl border border-outline-variant bg-surface/90 p-5 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.25)] backdrop-blur md:p-6">
        {/* header */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />
            Live · sample run
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: count }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className={`h-1 rounded-full transition-all ${
                  i === index ? "w-6 bg-primary" : "w-1.5 bg-outline-variant"
                }`}
              />
            ))}
          </div>
        </div>

        {/* cycling content */}
        <div className="relative mt-4 min-h-[360px] md:min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={spec.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={expressiveDefault}
            >
              <p className="text-sm leading-relaxed text-on-surface md:text-[15px]">
                <span className="text-on-surface-variant">Brief:</span>{" "}
                <span className="font-medium">&ldquo;{spec.brief}&rdquo;</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-wider text-on-surface-variant">
                <span>{spec.scale}</span>
                <span aria-hidden>·</span>
                <span>{spec.region}</span>
              </div>

              <div className="mt-5">
                <MiniDiagram />
              </div>

              <div className="mt-5 rounded-2xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                  Recommended
                </p>
                <p className="mt-1 text-base font-semibold text-on-surface">
                  {spec.pick.service}
                </p>
                <p className="mt-0.5 text-xs text-on-surface-variant">{spec.pick.vs}</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-outline-variant px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Cost at launch
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-on-surface">
                    {spec.cost}
                  </p>
                </div>
                <div className="rounded-xl border border-outline-variant px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Sources cited
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-on-surface">
                    {spec.sources} <span className="text-on-surface-variant">/ KB + web</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* Tiny inline architecture diagram for the specimen panel — 6 nodes,
 * a few edges, just enough to read as a system.
 */
function MiniDiagram(): React.ReactElement {
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
      <svg viewBox="0 0 320 110" className="h-full w-full" aria-hidden>
        <g
          stroke="rgb(var(--md-sys-color-primary))"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        >
          <path d="M64 26 L130 55" />
          <path d="M196 26 L130 55" />
          <path d="M130 55 L64 84" />
          <path d="M130 55 L196 84" />
          <path
            d="M130 55 L256 84"
            strokeDasharray="4 4"
            stroke="rgb(var(--md-sys-color-on-surface-variant))"
          />
        </g>
        {[
          { x: 30, y: 12, w: 70, label: "Edge LB" },
          { x: 162, y: 12, w: 70, label: "Web" },
          { x: 96, y: 41, w: 70, label: "Worker" },
          { x: 30, y: 70, w: 70, label: "Postgres" },
          { x: 162, y: 70, w: 70, label: "Redis" },
          { x: 222, y: 70, w: 70, label: "Vertex AI" },
        ].map((n) => (
          <g key={n.label}>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height="28"
              rx="6"
              fill="rgb(var(--md-sys-color-surface))"
              stroke="rgb(var(--md-sys-color-outline))"
              strokeWidth="0.8"
            />
            <text
              x={n.x + n.w / 2}
              y={n.y + 18}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="600"
              fill="rgb(var(--md-sys-color-on-surface))"
              fontFamily="var(--font-plus-jakarta)"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }): React.ReactElement {
  return (
    <div>
      <span className="block text-2xl font-semibold tracking-tight tabular-nums text-on-surface">
        {n}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-on-surface-variant">{label}</span>
    </div>
  );
}

function Check(): React.ReactElement {
  return (
    <span
      aria-hidden
      className="inline-flex size-4 items-center justify-center rounded-full bg-primary/10 text-primary"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M2 5.2L4 7L8 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
