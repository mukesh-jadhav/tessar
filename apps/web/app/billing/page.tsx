"use client";

import { motion } from "motion/react";

import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
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
    <AppShell pageLabel="billing">
      <main className="relative z-10 mx-auto max-w-[920px] px-6 py-8 md:px-10">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={expressiveDefault}
          className="border-outline-variant bg-surface/95 rounded-2xl border p-6 backdrop-blur"
        >
          <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
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
            <span className="text-on-surface-variant text-[11px]">
              Update payment method, download invoices, request a refund.
            </span>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...expressiveDefault, delay: 0.05 }}
          className="border-outline-variant bg-surface/95 mt-5 rounded-2xl border p-1 backdrop-blur"
        >
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.18em]">
              Payment history
            </p>
            <p className="text-on-surface-variant text-[11px]">
              Total spent ·{" "}
              <span className="text-on-surface font-semibold tabular-nums">${totalSpent}</span>
            </p>
          </div>
          <div className="overflow-hidden rounded-xl">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-outline-variant text-on-surface-variant border-y text-[10px] uppercase tracking-wider">
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
                    className="border-outline-variant/60 hover:bg-on-surface/[0.03] border-b last:border-b-0"
                  >
                    <td className="text-on-surface-variant px-5 py-2.5 tabular-nums">
                      {fmtDate(c.createdAt)}
                    </td>
                    <td className="text-on-surface px-2 py-2.5 font-mono text-[11px]">{c.id}</td>
                    <td className="text-on-surface px-2 py-2.5">Architecture run · {c.domain}</td>
                    <td className="text-on-surface px-5 py-2.5 text-right font-semibold tabular-nums">
                      ${c.paidUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        <p className="text-on-surface-variant mt-6 text-center text-[10.5px]">
          Need a refund? Email{" "}
          <a className="underline-offset-2 hover:underline" href="mailto:support@tessar.dev">
            support@tessar.dev
          </a>{" "}
          within 30 days.
        </p>
      </main>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
      <p className="text-on-surface mt-0.5 text-[13px] font-medium">{value}</p>
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
