"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TrustStat } from "@/components/ui/trust-stat";
import { springs } from "@/lib/motion/springs";
import { PRICE_PER_RUN_LABEL } from "@/lib/pricing";

const expressiveDefault = springs.expressiveDefault;

/* ---------------------------------------------------------------------------
 * /signin — Auth.js-shaped sign-in screen (mocked).
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ ✓ TESSAR                                          theme      │
 *   │                                                              │
 *   │              ┌─────────────────────────────┐                 │
 *   │              │ Welcome to TESSAR           │                 │
 *   │              │ Magic-link or Google.       │                 │
 *   │              │                             │                 │
 *   │              │ [ email ▸ Send magic link ] │                 │
 *   │              │       — or —                │                 │
 *   │              │ [ Continue with Google ]    │                 │
 *   │              │                             │                 │
 *   │              │ By signing in… ToS · Privacy│                 │
 *   │              └─────────────────────────────┘                 │
 *   │                                                              │
 *   │              tiny editorial trust-bar (3 lines)              │
 *   └──────────────────────────────────────────────────────────────┘
 *
 *   Mocked: clicking either button transitions to a "Check your email"
 *   confirmation panel (magic-link) or routes to /dashboard (Google).
 *   Phase 2 wires Auth.js (Resend + Google OAuth).
 * ------------------------------------------------------------------------- */

export default function SignInPage(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /\S+@\S+\.\S+/.test(email.trim());

  async function handleSendLink() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // `redirect: false` keeps us on /signin so we can show the
      // "check your email" panel inline. Auth.js still queues the
      // verification token + Nodemailer send in the background.
      const res = await signIn("nodemailer", {
        email: email.trim(),
        redirect: false,
        redirectTo: "/dashboard",
      });
      if (res?.error) {
        setError("Could not send the magic link. Try again in a moment.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Could not send the magic link. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogle() {
    void signIn("google", { redirectTo: "/dashboard" });
  }

  return (
    <div className="bg-surface text-on-surface relative h-dvh w-screen overflow-hidden">
      {/* Canvas backdrop */}
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

      <header className="absolute left-6 right-6 top-5 z-20 flex items-center justify-between md:left-10 md:top-7">
        <Link href="/" className="flex items-center gap-2.5">
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
        </Link>
        <ThemeToggle />
      </header>

      <main className="absolute inset-0 grid place-items-center px-6">
        <div className="flex w-full max-w-[420px] flex-col items-center gap-6">
          <motion.section
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={expressiveDefault}
            className="border-outline-variant bg-surface/95 w-full overflow-hidden rounded-2xl border p-7 shadow-[0_24px_70px_-24px_rgb(0_0_0/0.35)] backdrop-blur"
          >
            {sent ? (
              <ConfirmationPanel email={email} onUndo={() => setSent(false)} />
            ) : (
              <SignInPanel
                email={email}
                onEmail={setEmail}
                onSendLink={handleSendLink}
                onGoogle={handleGoogle}
                valid={valid}
                submitting={submitting}
                error={error}
              />
            )}
          </motion.section>

          {/* Editorial trust bar */}
          <ul className="grid w-full grid-cols-3 gap-2 text-center">
            <TrustStat value={PRICE_PER_RUN_LABEL} sub="per run" />
            <TrustStat value="~12 min" sub="median run" />
            <TrustStat value="0" sub="lock-in" />
          </ul>
        </div>
      </main>
    </div>
  );
}

function SignInPanel({
  email,
  onEmail,
  onSendLink,
  onGoogle,
  valid,
  submitting,
  error,
}: {
  email: string;
  onEmail: (v: string) => void;
  onSendLink: () => void;
  onGoogle: () => void;
  valid: boolean;
  submitting: boolean;
  error: string | null;
}): React.ReactElement {
  return (
    <>
      <p className="text-primary text-[10px] font-semibold uppercase tracking-[0.18em]">Sign in</p>
      <h1 className="text-on-surface mt-1 font-serif text-[26px] leading-tight">
        Welcome to TESSAR.
      </h1>
      <p className="text-on-surface-variant mt-1.5 text-[12.5px]">
        Magic-link or Google. We never use a password.
      </p>

      <form
        className="mt-5 space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSendLink();
        }}
      >
        <label className="block">
          <span className="text-on-surface-variant mb-1 block text-[10px] font-semibold uppercase tracking-wider">
            Email
          </span>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="you@company.com"
            className="border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary w-full rounded-lg border px-3 py-2 text-[13px] focus:outline-none"
          />
        </label>
        <Button
          type="submit"
          disabled={!valid || submitting}
          className="w-full rounded-lg py-2.5 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send magic link →"}
        </Button>
        {error ? (
          <p role="alert" className="text-error text-[11px]">
            {error}
          </p>
        ) : null}
      </form>

      <div
        className="text-on-surface-variant my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider"
        aria-hidden
      >
        <span className="bg-outline-variant h-px flex-1" />
        or
        <span className="bg-outline-variant h-px flex-1" />
      </div>

      {/*
        Google sign-in button — follows the official Google Identity
        Services brand spec (pill variant): white surface, #747775 1px
        border, 4-color G mark, "Sign in with Google" wordmark, Roboto
        500. Spec: https://developers.google.com/identity/branding-guidelines
      */}
      <button
        type="button"
        onClick={onGoogle}
        className="flex h-10 w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-3 text-[14px] font-medium text-[#1f1f1f] transition-shadow hover:shadow-[0_1px_3px_rgb(60_64_67/0.15),0_1px_2px_rgb(60_64_67/0.30)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f1f1f]/30 active:shadow-none"
        style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}
      >
        <GoogleMark />
        Sign in with Google
      </button>

      <p className="text-on-surface-variant mt-5 text-center text-[10.5px]">
        By signing in you agree to our{" "}
        <Link href="/terms" className="underline-offset-2 hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}

function ConfirmationPanel({
  email,
  onUndo,
}: {
  email: string;
  onUndo: () => void;
}): React.ReactElement {
  return (
    <>
      <span
        aria-hidden
        className="bg-primary/10 text-primary grid size-10 place-items-center rounded-full"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 7l9 6 9-6M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <h1 className="text-on-surface mt-3 font-serif text-[24px] leading-tight">
        Check your email.
      </h1>
      <p className="text-on-surface-variant mt-1.5 text-[12.5px]">
        We sent a one-time sign-in link to{" "}
        <span className="text-on-surface font-semibold">{email}</span>. The link works once and
        expires in 15 minutes.
      </p>
      <div className="mt-5 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="bg-primary text-on-primary flex-1 rounded-lg py-2.5 text-center text-[12.5px] font-semibold"
        >
          I&apos;m signed in →
        </Link>
        <button
          type="button"
          onClick={onUndo}
          className="text-on-surface-variant hover:text-on-surface text-[11.5px] font-medium underline-offset-2 hover:underline"
        >
          Wrong email?
        </button>
      </div>
    </>
  );
}

function GoogleMark(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.32A8.99 8.99 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.95A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.95 4.04l3.02-2.32z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 8.99 8.99 0 0 0 .95 4.96l3.02 2.32C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
