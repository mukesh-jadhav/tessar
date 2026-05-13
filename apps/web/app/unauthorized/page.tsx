import Link from "next/link";

import { Button } from "@/components/ui/button";

/* ---------------------------------------------------------------------------
 * /unauthorized — Shown when a request fails authentication or authorization.
 * Phase 2 will route here from middleware on protected routes (/dashboard,
 * /billing, /run/[id]) when the session is missing or expired.
 * ------------------------------------------------------------------------- */

export default function UnauthorizedPage(): React.ReactElement {
  return (
    <div className="relative grid min-h-dvh w-screen place-items-center overflow-hidden bg-surface px-6 text-on-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 88% 12%, rgb(var(--md-sys-color-primary) / 0.10), transparent 70%), radial-gradient(50% 40% at 10% 92%, rgb(var(--md-sys-color-primary) / 0.06), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--md-sys-color-on-surface)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--md-sys-color-on-surface)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <section className="relative z-10 flex max-w-[520px] flex-col items-start text-left">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          401 · Sign-in required
        </p>
        <h1 className="mt-3 font-serif text-[40px] leading-[1.05] text-on-surface md:text-[52px]">
          You need to sign in.
        </h1>
        <p className="mt-4 max-w-[440px] text-[14px] leading-relaxed text-on-surface-variant">
          This page is private to your account. Sign in with a magic-link or
          Google to continue. Your run history is preserved.
        </p>
        <div className="mt-7 flex items-center gap-3">
          <Link href="/signin">
            <Button className="rounded-full px-5 py-2.5 text-[12.5px] font-semibold">
              Sign in →
            </Button>
          </Link>
          <Link
            href="/"
            className="text-[12px] font-medium text-on-surface-variant underline-offset-2 hover:text-on-surface hover:underline"
          >
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
