/**
 * /account — auth-gated account settings + legal receipt.
 *
 * Phase 1 scope: read-only block showing the user's most recent Terms
 * acceptance (version, date, capture context, IP if known) plus a list
 * of the last ~10 acceptances for transparency. This is the page we'll
 * point regulators / enterprise procurement to when they ask "show me
 * the consent record". See ADR-0011.
 *
 * Account profile editing (name, avatar) is intentionally deferred —
 * Auth.js manages identity, and the MVP doesn't have a profile concept
 * users care about yet.
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/shell/app-shell";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/legal";

export const dynamic = "force-dynamic";

export default async function AccountPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/account");

  const [user, acceptances] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        name: true,
        createdAt: true,
        latestTermsVersion: true,
      },
    }),
    prisma.termsAcceptance.findMany({
      where: { userId: session.user.id },
      orderBy: { acceptedAt: "desc" },
      take: 10,
      select: {
        id: true,
        termsVersion: true,
        privacyVersion: true,
        context: true,
        ipAddress: true,
        acceptedAt: true,
      },
    }),
  ]);

  if (!user) redirect("/signin");

  const upToDate = user.latestTermsVersion === TERMS_VERSION;
  const latest = acceptances[0] ?? null;

  return (
    <AppShell pageLabel="Account">
      <main className="relative z-10 mx-auto w-full max-w-[860px] px-6 py-10 md:px-10 md:py-14">
        <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">
          Account
        </p>
        <h1 className="text-on-surface mt-1 font-serif text-[32px] leading-tight">
          {user.name ?? user.email}
        </h1>
        <p className="text-on-surface-variant mt-1 text-[12.5px]">
          {user.email} · joined {formatDate(user.createdAt)}
        </p>

        {/* Profile */}
        <section className="border-outline-variant bg-surface/95 mt-8 rounded-2xl border p-6 backdrop-blur">
          <h2 className="text-on-surface text-[14px] font-semibold">Profile</h2>
          <p className="text-on-surface-variant mt-1 text-[12px] leading-relaxed">
            Identity is managed through your sign-in provider (Google or magic link). To change your
            email, sign in with the new address — we&apos;ll link the accounts automatically.
          </p>
          <dl className="text-on-surface mt-4 grid grid-cols-1 gap-3 text-[12.5px] md:grid-cols-2">
            <div>
              <dt className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                Email
              </dt>
              <dd className="mt-0.5">{user.email}</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider">
                Display name
              </dt>
              <dd className="mt-0.5">
                {user.name ?? <span className="text-on-surface-variant">—</span>}
              </dd>
            </div>
          </dl>
        </section>

        {/* Legal & consent */}
        <section className="border-outline-variant bg-surface/95 mt-6 rounded-2xl border p-6 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-on-surface text-[14px] font-semibold">Legal &amp; consent</h2>
              <p className="text-on-surface-variant mt-1 max-w-[60ch] text-[12px] leading-relaxed">
                Your record of acceptance for our{" "}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                . We keep this so you, our regulators, and your procurement team can all see exactly
                what was agreed and when.
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
                upToDate ? "bg-primary/12 text-primary" : "bg-error/15 text-error"
              }`}
            >
              {upToDate ? "Up to date" : "Action needed"}
            </span>
          </div>

          <div className="border-outline-variant bg-surface-container-low mt-4 rounded-xl border p-4">
            {latest ? (
              <>
                <p className="text-on-surface text-[12.5px] leading-relaxed">
                  You agreed to <strong>Terms v{latest.termsVersion}</strong> and{" "}
                  <strong>Privacy v{latest.privacyVersion}</strong> on{" "}
                  <strong>{formatDateTime(latest.acceptedAt)}</strong>
                  {latest.ipAddress ? (
                    <>
                      {" "}
                      from <code className="text-[11.5px]">{latest.ipAddress}</code>
                    </>
                  ) : null}
                  .
                </p>
                <p className="text-on-surface-variant mt-1 text-[11px]">
                  Captured at {humanContext(latest.context)}. Current published version: Terms v
                  {TERMS_VERSION} · Privacy v{PRIVACY_VERSION} (last updated {LEGAL_LAST_UPDATED}).
                </p>
              </>
            ) : (
              <p className="text-on-surface-variant text-[12px]">
                No acceptance record found. You&apos;ll be prompted to confirm the current Terms on
                your next page load.
              </p>
            )}
          </div>

          {acceptances.length > 1 ? (
            <details className="text-on-surface-variant mt-3 text-[11.5px]">
              <summary className="hover:text-on-surface cursor-pointer">
                Full acceptance history ({acceptances.length})
              </summary>
              <ul className="border-outline-variant mt-2 divide-y rounded-lg border">
                {acceptances.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
                  >
                    <span className="text-on-surface text-[12px]">
                      Terms v{a.termsVersion} · Privacy v{a.privacyVersion}
                    </span>
                    <span className="text-on-surface-variant text-[11px]">
                      {humanContext(a.context)} · {formatDateTime(a.acceptedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <p className="text-on-surface-variant mt-4 text-[11px] leading-relaxed">
            Need a copy of these records for procurement, or to request deletion under the Privacy
            Policy?{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </main>
    </AppShell>
  );
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function humanContext(c: string): string {
  switch (c) {
    case "signup":
      return "sign-up";
    case "checkout":
      return "checkout";
    case "reaccept":
      return "in-app re-consent";
    default:
      return c;
  }
}
