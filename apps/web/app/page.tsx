"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { springs } from "@/lib/motion/springs";

const expressiveDefault = springs.expressiveDefault;

/* ---------------------------------------------------------------------------
 * TESSAR landing — calm, confident, one specimen.
 *
 * The previous landing cycled three sample packages every 6 s — busy, salesy,
 * and competed for attention with the headline. The product&apos;s promise is
 * &quot;decided, defensible answers,&quot; not &quot;watch us spin.&quot; Replace the carousel
 * with one finished package behind glass.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ ✓ TESSAR  (floating)                Sign in · Start a brief (floating)│
 *   │                                                                      │
 *   │   System design, decided                ┌──────────────────────────┐ │
 *   │   Decide what to build.                 │   ONE static specimen      ││   │   In about twelve minutes.              │   brief · diagram          ││   │                                         │   recommended pick         ││   │   [paragraph]                           │   cost · sources           ││   │                                         └──────────────────────────┘ │
 *   │   [ Start a brief → ]   See a sample                                 │
 *   │                                                                      │
 *   │ &quot;1,247 designs decided · 9 agents per run&quot;                          │
 *   └──────────────────────────────────────────────────────────────────────┘
 * ------------------------------------------------------------------------- */

export default function LandingPage(): React.ReactElement {
  return (
    <div className="bg-surface text-on-surface relative min-h-dvh w-screen overflow-x-hidden">
      {/* Soft brand wash */}
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

      {/* FLOATING TOP CHROME — brand left, two actions right */}
      <div className="absolute left-6 top-5 z-20 flex items-center gap-2.5 md:left-10 md:top-7">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="bg-primary text-on-primary grid size-7 place-items-center rounded-full shadow-[0_4px_14px_-6px_rgb(var(--md-sys-color-primary)/0.5)]"
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

      <div className="absolute right-6 top-5 z-20 flex items-center gap-2 md:right-10 md:top-7">
        <ThemeToggle />
        <Link
          href="/signin"
          className="text-on-surface-variant hover:text-on-surface rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Sign in
        </Link>
      </div>

      {/* MAIN STAGE — two columns, generous, no scroll target. */}
      <main className="relative z-10 mx-auto grid min-h-dvh max-w-[1280px] grid-cols-1 items-center gap-10 px-6 pb-20 pt-28 md:grid-cols-12 md:gap-12 md:px-14 md:pb-24 md:pt-28">
        {/* LEFT — editorial pitch */}
        <section className="md:col-span-7 md:pr-4 xl:col-span-6">
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={expressiveDefault}
            className="border-outline-variant bg-surface/80 text-on-surface-variant inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-wide backdrop-blur"
          >
            <span aria-hidden className="bg-primary size-1.5 rounded-full" />
            System design, decided
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...expressiveDefault, delay: 0.05 }}
            className="text-on-surface mt-7 text-balance font-serif text-[44px] leading-[1.02] tracking-tight md:text-[64px] xl:text-[76px]"
          >
            Decide what to build.
            <span className="text-primary block">In about twelve minutes.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...expressiveDefault, delay: 0.1 }}
            className="text-on-surface-variant mt-6 max-w-xl text-base leading-relaxed md:text-lg"
          >
            Most architecture advice is opinion. Every reference design hides its assumptions. A
            chatbot just guesses with confidence. We{" "}
            <span className="text-on-surface font-semibold">read the open web for you</span> &mdash;
            cross-checked against a curated knowledge base, every claim grounded in a source you can
            open.
          </motion.p>

          <motion.ul
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...expressiveDefault, delay: 0.15 }}
            className="text-on-surface-variant mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm"
          >
            <li className="inline-flex items-center gap-2">
              <Check /> Not a chatbot guess
            </li>
            <li className="inline-flex items-center gap-2">
              <Check /> Source-cited, always
            </li>
            <li className="inline-flex items-center gap-2">
              <Check /> One named architecture
            </li>
          </motion.ul>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...expressiveDefault, delay: 0.2 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <Link href="/brief">
              <Button variant="filled" size="lg" className="px-7 text-[15px]">
                Start a brief &rarr;
              </Button>
            </Link>
            <Link
              href="/decide"
              className="text-on-surface-variant hover:text-on-surface text-sm font-medium underline-offset-4 hover:underline"
            >
              See a sample package
            </Link>
          </motion.div>
        </section>

        {/* RIGHT — one finished package, behind glass. No cycling. */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...expressiveDefault, delay: 0.15 }}
          className="md:col-span-5 md:pl-4 xl:col-span-6 xl:pl-16"
        >
          <SpecimenPanel />
        </motion.aside>
      </main>

      {/* FLOATING BOTTOM STATS — subtle, no link rail. */}
      <div className="text-on-surface-variant absolute bottom-5 left-6 z-20 flex items-end gap-6 text-sm md:bottom-7 md:left-14">
        <Stat n="1,247" label="designs decided" />
        <span aria-hidden className="bg-outline-variant hidden h-8 w-px md:block" />
        <Stat n="39%" label="rejected the obvious" />
        <span aria-hidden className="bg-outline-variant hidden h-8 w-px md:block" />
        <Stat n="9" label="agents per run" />
      </div>
    </div>
  );
}

/* ─── SpecimenPanel — one static designed package ──────────────── */

function SpecimenPanel(): React.ReactElement {
  return (
    <div className="border-outline-variant bg-surface/90 relative w-full overflow-hidden rounded-3xl border p-5 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.25)] backdrop-blur md:p-6">
      <div className="flex items-center justify-between">
        <span className="text-primary inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
          <span aria-hidden className="bg-primary size-1.5 rounded-full" />
          Sample package
        </span>
        <span className="text-on-surface-variant text-[10.5px] font-medium uppercase tracking-wider">
          run #r4f3a2b
        </span>
      </div>

      <p className="text-on-surface mt-4 text-sm leading-relaxed md:text-[15px]">
        <span className="text-on-surface-variant">Brief:</span>{" "}
        <span className="font-medium">
          &ldquo;B2B SaaS that ingests ~10M product events/day and bills monthly.&rdquo;
        </span>
      </p>
      <div className="text-on-surface-variant mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-wider">
        <span>10M events/day · multi-tenant</span>
        <span aria-hidden>·</span>
        <span>EU residency</span>
      </div>

      <div className="mt-5">
        <MiniDiagram />
      </div>

      <div className="border-outline-variant bg-surface-container-low mt-5 rounded-2xl border p-4">
        <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
          Recommended
        </p>
        <p className="text-on-surface mt-1 text-base font-semibold">
          Cloud SQL Postgres + pgvector
        </p>
        <p className="text-on-surface-variant mt-0.5 text-xs">vs AlloyDB · DynamoDB</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="border-outline-variant rounded-xl border px-3 py-2.5">
          <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            Cost at launch
          </p>
          <p className="text-on-surface mt-0.5 text-sm font-semibold tabular-nums">
            $184 / mo idle
          </p>
        </div>
        <div className="border-outline-variant rounded-xl border px-3 py-2.5">
          <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
            Sources cited
          </p>
          <p className="text-on-surface mt-0.5 text-sm font-semibold tabular-nums">
            14 <span className="text-on-surface-variant">/ KB + web</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* Tiny inline architecture diagram for the specimen panel. */
function MiniDiagram(): React.ReactElement {
  return (
    <div className="border-outline-variant bg-surface-container-lowest relative h-28 w-full overflow-hidden rounded-2xl border">
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
      <p className="text-on-surface text-2xl font-semibold tabular-nums leading-none">{n}</p>
      <p className="text-on-surface-variant mt-1 text-[11px] uppercase tracking-wider">{label}</p>
    </div>
  );
}

function Check(): React.ReactElement {
  return (
    <span
      aria-hidden
      className="bg-primary/15 text-primary grid size-4 place-items-center rounded-full"
    >
      <svg width="9" height="9" viewBox="0 0 11 11" fill="none">
        <path
          d="M2 5.7L4.3 8L9 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
