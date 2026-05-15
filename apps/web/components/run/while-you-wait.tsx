"use client";

/**
 * <WhileYouWait /> — editorial mini-cards shown on /run/[id] while the
 * orchestrator is working.
 *
 * Honest content, not a fidget toy: each card teaches the user
 * something real about what the package will contain or why the
 * analyst takes the time it does. Reinforces the locked value props
 * (research depth, decision transparency, complete deliverable —
 * see product-goals.instructions.md).
 *
 * Behaviour:
 *  - Auto-rotates every ~9s.
 *  - Pauses on hover and when focused (so a reader is never yanked
 *    away mid-sentence).
 *  - Hidden once the run finishes (the package CTA is the story then).
 *  - Respects prefers-reduced-motion: rotation continues but the
 *    cross-fade collapses to an instant swap.
 */

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

interface Card {
  eyebrow: string;
  title: string;
  body: string;
}

const CARDS: readonly Card[] = [
  {
    eyebrow: "How we work",
    title: "Every component pick cites a source.",
    body: "We grade each pick against a curated knowledge base plus live web research. That's why this takes minutes, not seconds.",
  },
  {
    eyebrow: "What you'll get",
    title: "Three sequence diagrams: write, read, async.",
    body: "Your package shows how the system actually behaves under each load shape — not just a static box-and-arrow diagram.",
  },
  {
    eyebrow: "Decision transparency",
    title: "Each pick carries a confidence grade.",
    body: "Low / medium / high — so you know which calls are well-supported and which deserve a second look before you build.",
  },
  {
    eyebrow: "Defensibility",
    title: "A failure-modes table comes with the design.",
    body: "For every fragile node we list how it can fail, the blast radius, and the mitigation. No hand-waving.",
  },
  {
    eyebrow: "Build sequence",
    title: "Phased build order, not a wish list.",
    body: "Your package ends with what to build first, second, and third — plus exit criteria for each phase.",
  },
  {
    eyebrow: "Trade-offs",
    title: "Alternatives are kept on the record.",
    body: "Every recommendation comes with the runners-up and why we passed. You can override any pick with full context.",
  },
];

interface Props {
  /** Hide the section entirely (e.g. when the run is done). */
  visible: boolean;
  /** Optional className for the wrapping <section>. */
  className?: string;
}

export function WhileYouWait({ visible, className }: Props): React.ReactElement | null {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!visible || paused) return;
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % CARDS.length);
    }, 9000);
    return () => window.clearInterval(id);
  }, [visible, paused]);

  if (!visible) return null;

  const card = CARDS[index] as Card;
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <section
      aria-label="What to expect from your package"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={
        "border-outline-variant/60 bg-surface-container-low/60 relative overflow-hidden rounded-2xl border p-5 md:p-6 " +
        (className ?? "")
      }
    >
      {/* Soft brand wash so this reads as editorial, not chrome. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 80% at 90% 10%, rgb(var(--md-sys-color-primary) / 0.06), transparent 70%)",
        }}
      />
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transition}
          >
            <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
              {card.eyebrow}
            </p>
            <h3 className="text-on-surface mt-1 max-w-2xl text-[18px] font-semibold leading-snug md:text-[20px]">
              {card.title}
            </h3>
            <p className="text-on-surface-variant mt-2 max-w-2xl text-[13px] leading-relaxed">
              {card.body}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots — one per card, current one filled. Click to jump. */}
        <div role="tablist" aria-label="Editorial cards" className="mt-4 flex items-center gap-1.5">
          {CARDS.map((c, n) => (
            <button
              key={c.title}
              type="button"
              role="tab"
              aria-selected={n === index}
              aria-label={`Card ${n + 1}: ${c.title}`}
              onClick={() => setIndex(n)}
              className={
                "h-1.5 rounded-full transition-all " +
                (n === index
                  ? "bg-primary w-6"
                  : "bg-on-surface-variant/30 hover:bg-on-surface-variant/60 w-1.5")
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
