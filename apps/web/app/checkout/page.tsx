"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { springs } from "@/lib/motion/springs";
import { PRICE_PER_RUN_LABEL, PRICE_PER_RUN_LABEL_2DP } from "@/lib/pricing";

const expressiveDefault = springs.expressiveDefault;

/* ---------------------------------------------------------------------------
 * /checkout — Pre-Stripe summary screen.
 *
 * In Phase 2 the "Continue to payment" button POSTs /api/checkout and
 * redirects to a real Stripe Checkout Session. In Phase 1 we mock the
 * round-trip with a brief delay then route the user to /run/{id}.
 *
 *   Query params (set by /brief):
 *     ?run=<runId>     — id assigned at brief submission
 *     ?brief=<snippet> — first 240 chars of the brief, URL-encoded
 * ------------------------------------------------------------------------- */

export default function CheckoutPage(): React.ReactElement {
  const [params, setParams] = useState<{ run: string; brief: string }>({
    run: "",
    brief: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    setParams({
      run: u.get("run") ?? `r${Math.random().toString(36).slice(2, 8)}`,
      brief: u.get("brief") ?? "Your brief is ready to run.",
    });
    if (u.get("canceled") === "1") {
      setError("Payment canceled. You can try again whenever you're ready.");
    }
  }, []);

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: params.run }),
      });
      if (res.status === 409) {
        // Already paid → straight to the run.
        window.location.href = `/run/${params.run}`;
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `checkout_failed_${res.status}`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("no_redirect_url");
      window.location.href = url;
    } catch (err) {
      console.error("[checkout] submit failed", err);
      setError("Couldn't start checkout. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface relative min-h-dvh w-screen overflow-x-hidden">
      {/* canvas */}
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

      <header className="absolute left-6 right-6 top-5 z-20 flex items-center justify-between md:left-10 md:top-7">
        <Link href="/brief" className="flex items-center gap-2.5">
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
          <span className="text-on-surface-variant ml-2 text-[11px]">· checkout</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative z-10 mx-auto grid min-h-dvh max-w-[920px] place-items-center px-6 py-24">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={expressiveDefault}
          className="grid w-full gap-4 md:grid-cols-[1fr_360px]"
        >
          {/* Brief recap */}
          <article className="border-outline-variant bg-surface/95 rounded-2xl border p-6 backdrop-blur">
            <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
              Confirm
            </p>
            <h1 className="text-on-surface mt-1 font-serif text-[28px] leading-tight">
              One run. One package. {PRICE_PER_RUN_LABEL}.
            </h1>
            <p className="text-on-surface-variant mt-2 text-[12.5px] leading-relaxed">
              You&apos;ll watch the agents work in real time, then download a defensible
              architecture package as PDF and Markdown.
            </p>

            <div className="border-outline-variant bg-surface mt-5 rounded-xl border px-4 py-3">
              <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                Your brief
              </p>
              <p className="text-on-surface mt-1.5 line-clamp-5 whitespace-pre-line text-[13px] leading-relaxed">
                {params.brief}
              </p>
              <Link
                href="/brief"
                className="text-primary mt-2 inline-block text-[11px] font-medium underline-offset-2 hover:underline"
              >
                Edit brief
              </Link>
            </div>

            <ul className="text-on-surface mt-5 grid gap-2.5 text-[12px]">
              <Bullet>Up to 3 clarifying questions before agents run.</Bullet>
              <Bullet>Median run time ≈ 12 minutes.</Bullet>
              <Bullet>Every component cited; refund if we can&apos;t back it.</Bullet>
            </ul>
          </article>

          {/* Pay panel */}
          <aside className="border-outline-variant bg-surface/95 flex h-fit flex-col gap-3 rounded-2xl border p-5 backdrop-blur">
            <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
              Order
            </p>
            <div className="flex items-baseline justify-between">
              <span className="text-on-surface text-[12.5px]">1 × Architecture run</span>
              <span className="text-on-surface font-semibold tabular-nums">
                {PRICE_PER_RUN_LABEL_2DP}
              </span>
            </div>
            <div className="text-on-surface-variant flex items-baseline justify-between text-[11px]">
              <span>Tax</span>
              <span className="tabular-nums">Calculated at payment</span>
            </div>
            <div className="border-outline-variant my-1 border-t" />
            <div className="flex items-baseline justify-between">
              <span className="text-on-surface font-semibold">Total</span>
              <span className="text-on-surface font-serif text-[22px] font-semibold tabular-nums">
                {PRICE_PER_RUN_LABEL_2DP}
              </span>
            </div>

            <Button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="mt-2 w-full rounded-full py-2.5 text-[12.5px] font-semibold disabled:opacity-60"
            >
              {submitting ? "Redirecting…" : "Continue to payment →"}
            </Button>
            {error ? (
              <p
                role="alert"
                className="border-error/40 bg-error/10 text-error rounded-md border px-3 py-2 text-[11px]"
              >
                {error}
              </p>
            ) : null}
            <p className="text-on-surface-variant text-center text-[10.5px]">
              Secure payment via <span className="text-on-surface font-semibold">Stripe</span>. You
              can request a refund if the package fails our citation bar.
            </p>
            <p className="text-on-surface-variant text-center text-[10.5px] leading-relaxed">
              By starting this run you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline">
                Terms
              </Link>{" "}
              and acknowledge that recommendations are AI-generated research and require
              professional review before production use.
            </p>
          </aside>
        </motion.section>
      </main>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />
      <span>{children}</span>
    </li>
  );
}
