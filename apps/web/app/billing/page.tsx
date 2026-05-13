"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PAST_RUNS } from "@/lib/mocks/past-runs";
import { springs } from "@/lib/motion/springs";
import { PRICE_PER_RUN_LABEL } from "@/lib/pricing";

const expressiveDefault = springs.expressiveDefault;

/* ---------------------------------------------------------------------------
 * /billing — Mocked Stripe customer portal stand-in.
 *
 * - Top: "Account" card with email + payment method on file.
 * - Middle: payment history table derived from PAST_RUNS.
 * - Bottom: "Manage in Stripe" CTA (mocked) + sign-out link.
 * ------------------------------------------------------------------------- */

export default function BillingPage(): React.ReactElement {
  const charges = PAST_RUNS.filter((r) => r.paidUsd > 0);
  const totalSpent = charges.reduce((s, r) => s + r.paidUsd, 0);

  return (
    <div className="relative min-h-dvh w-screen overflow-x-hidden bg-surface text-on-surface">
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

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-outline-variant bg-surface/85 px-6 py-3 backdrop-blur md:px-10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-full bg-primary text-on-primary shadow-[0_4px_14px_-6px_rgb(var(--md-sys-color-primary)/0.5)]"
            >
              <svg width="12" height="12" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 5.6 L4.2 8 L9 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-[13px] font-semibold tracking-tight">TESSAR</span>
          </Link>
          <span className="text-[11px] text-on-surface-variant">· billing</span>
        </div>
        <nav className="flex items-center gap-1.5 text-[11.5px]">
          <Link
            href="/dashboard"
            className="rounded-full px-3 py-1.5 font-medium text-on-surface-variant hover:bg-on-surface/[0.04] hover:text-on-surface"
          >
            Dashboard
          </Link>
          <Link
            href="/signin"
            className="rounded-full px-3 py-1.5 font-medium text-on-surface-variant hover:bg-on-surface/[0.04] hover:text-on-surface"
          >
            Sign out
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[920px] px-6 py-8 md:px-10">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={expressiveDefault}
          className="rounded-2xl border border-outline-variant bg-surface/95 p-6 backdrop-blur"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            Account
          </p>
          <div className="mt-2 grid gap-4 md:grid-cols-3">
            <Field label="Email" value="founder@example.com" />
            <Field label="Plan" value={`Pay-per-run · ${PRICE_PER_RUN_LABEL}`} />
            <Field label="Payment method" value="Visa ending in 4242" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button className="rounded-full px-5 py-2 text-[12px] font-semibold">
              Manage in Stripe →
            </Button>
            <span className="text-[11px] text-on-surface-variant">
              Update payment method, download invoices, request a refund.
            </span>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...expressiveDefault, delay: 0.05 }}
          className="mt-5 rounded-2xl border border-outline-variant bg-surface/95 p-1 backdrop-blur"
        >
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
              Payment history
            </p>
            <p className="text-[11px] text-on-surface-variant">
              Total spent ·{" "}
              <span className="font-semibold tabular-nums text-on-surface">${totalSpent}</span>
            </p>
          </div>
          <div className="overflow-hidden rounded-xl">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-y border-outline-variant text-[10px] uppercase tracking-wider text-on-surface-variant">
                  <th className="px-5 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Run</th>
                  <th className="px-2 py-2 font-semibold">Description</th>
                  <th className="px-5 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-outline-variant/60 last:border-b-0 hover:bg-on-surface/[0.03]"
                  >
                    <td className="px-5 py-2.5 tabular-nums text-on-surface-variant">
                      {fmtDate(c.createdAt)}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[11px] text-on-surface">
                      {c.id}
                    </td>
                    <td className="px-2 py-2.5 text-on-surface">
                      Architecture run · {c.domain}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-on-surface">
                      ${c.paidUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        <p className="mt-6 text-center text-[10.5px] text-on-surface-variant">
          Need a refund? Email{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="mailto:support@tessar.dev"
          >
            support@tessar.dev
          </a>{" "}
          within 30 days.
        </p>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <p className="mt-0.5 text-[13px] font-medium text-on-surface">{value}</p>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
