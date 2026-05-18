"use client";

import { motion } from "motion/react";

import type { LegalSection } from "@/lib/legal";

/* ---------------------------------------------------------------------------
 * <LegalDocument /> — shared layout for /terms and /privacy.
 *
 * Editorial, narrow column, plain prose. Headings are real <h2>s so screen
 * readers get a proper outline. Subtle stagger-in on scroll using motion.
 * ------------------------------------------------------------------------- */

interface Props {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  intro: string[];
  sections: LegalSection[];
  footer?: React.ReactNode;
}

export function LegalDocument({
  eyebrow,
  title,
  lastUpdated,
  intro,
  sections,
  footer,
}: Props): React.ReactElement {
  return (
    <main className="relative mx-auto w-full max-w-[760px] px-5 pb-24 pt-10 md:px-8 md:pt-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      >
        <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
          {eyebrow}
        </p>
        <h1 className="text-on-surface mt-2 font-serif text-[34px] leading-[1.05] md:text-[44px]">
          {title}
        </h1>
        <p className="text-on-surface-variant mt-2 text-[12px]">Last updated: {lastUpdated}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
        className="text-on-surface-variant mt-6 space-y-3 text-[13.5px] leading-relaxed"
      >
        {intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </motion.div>

      <div className="mt-10 space-y-8">
        {sections.map((s, idx) => (
          <motion.section
            key={s.heading}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.18) }}
          >
            <h2 className="text-on-surface text-[16px] font-semibold">{s.heading}</h2>
            <div className="text-on-surface-variant mt-2 space-y-2 text-[13.5px] leading-relaxed">
              {s.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </motion.section>
        ))}
      </div>

      {footer ? (
        <div className="border-outline-variant text-on-surface-variant mt-12 border-t pt-6 text-[12.5px]">
          {footer}
        </div>
      ) : null}
    </main>
  );
}
