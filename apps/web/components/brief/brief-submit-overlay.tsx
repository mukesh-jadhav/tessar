"use client";

import { AnimatePresence, motion } from "motion/react";

import { springs } from "@/lib/motion/springs";

/* ---------------------------------------------------------------------------
 * <BriefSubmitOverlay /> — full-screen "Starting your run…" curtain.
 *
 * Shown while POST /api/runs is in flight and again briefly while the
 * browser navigates to /run/[id]. The brief page's tiny in-button
 * spinner wasn't enough — between click and route change the page sat
 * still, so users thought nothing was happening. This overlay covers
 * that gap with a clear, animated affordance.
 *
 * No business logic — purely presentational. Caller controls `open`.
 * ------------------------------------------------------------------------- */

const STAGES: Array<{ label: string; sub: string }> = [
  { label: "Validating your brief", sub: "Checking structure & guardrails" },
  { label: "Queuing the run", sub: "Handing off to the orchestrator" },
  { label: "Spinning up agents", sub: "Research, architecture, costing" },
  { label: "Opening your live workspace", sub: "Almost there" },
];

export function BriefSubmitOverlay({ open }: { open: boolean }): React.ReactElement {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="overlay"
          role="status"
          aria-live="polite"
          aria-label="Starting your run"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="bg-surface/85 fixed inset-0 z-[60] grid place-items-center backdrop-blur-md"
        >
          {/* Soft brand glow behind the card. */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.expressiveDefault}
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(40% 35% at 50% 45%, rgb(var(--md-sys-color-primary) / 0.18), transparent 70%)",
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={springs.expressiveDefault}
            className="border-outline-variant/60 bg-surface-container-high/95 relative mx-6 w-full max-w-[440px] overflow-hidden rounded-3xl border p-7 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)]"
          >
            <PulseRings />

            <div className="relative">
              <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
                Starting your run
              </p>
              <h2 className="text-on-surface mt-2 text-[22px] font-semibold leading-snug">
                Handing your brief to the analyst.
              </h2>
              <p className="text-on-surface-variant mt-2 text-[13px] leading-relaxed">
                You&apos;ll land on a live workspace where you can watch the research happen in real
                time.
              </p>

              <div className="mt-6">
                <WavyBar />
              </div>

              <StageCarousel />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* Concentric expanding rings, very low opacity — gives the card a sense of
 * something happening even before the first stage swap. */
function PulseRings(): React.ReactElement {
  return (
    <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56">
      {[0, 0.6, 1.2].map((delay) => (
        <motion.span
          key={delay}
          initial={{ scale: 0.4, opacity: 0.0 }}
          animate={{ scale: 1.4, opacity: [0, 0.18, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, delay, ease: "easeOut" }}
          className="border-primary/60 absolute inset-0 rounded-full border"
        />
      ))}
    </div>
  );
}

/* Indeterminate wavy progress bar — uses inline SVG so it works without
 * pulling in the WavyProgress component (which is optimised for the run
 * watch screen and assumes a different container). */
function WavyBar(): React.ReactElement {
  return (
    <div
      role="progressbar"
      aria-label="Starting your run"
      className="bg-surface-container relative h-2.5 w-full overflow-hidden rounded-full"
    >
      <motion.div
        className="absolute inset-y-0 left-0 w-[40%] overflow-hidden"
        animate={{ x: ["-100%", "260%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="bg-primary/85 h-full w-full rounded-full" />
      </motion.div>
    </div>
  );
}

/* Cycles through the four stage labels every 1.4s. Purely cosmetic —
 * gives the user a sense of forward motion regardless of how fast the
 * POST actually returns. */
function StageCarousel(): React.ReactElement {
  return (
    <div className="mt-5 h-12">
      <AnimatePresence mode="wait" initial={false}>
        <StageTicker key="ticker" />
      </AnimatePresence>
    </div>
  );
}

function StageTicker(): React.ReactElement {
  return (
    <motion.div
      animate={{ y: [0, -48, -96, -144, 0] }}
      transition={{
        duration: 7.2,
        times: [0, 0.27, 0.55, 0.83, 1],
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className="space-y-0"
    >
      {STAGES.map((s) => (
        <div key={s.label} className="h-12">
          <p className="text-on-surface text-[13.5px] font-semibold">{s.label}</p>
          <p className="text-on-surface-variant text-[11.5px]">{s.sub}</p>
        </div>
      ))}
    </motion.div>
  );
}
