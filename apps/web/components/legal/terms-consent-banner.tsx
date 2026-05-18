"use client";

/**
 * <TermsConsentBanner /> — non-blocking re-consent surface.
 *
 * Mounted inside <AppShell>. Polls /api/legal/me once on mount to learn
 * the user's `latestTermsVersion` and compares it to the bundled
 * `TERMS_VERSION` constant. If they differ (or the user has never
 * consented), shows a slim banner above the page content with a single
 * "Accept updated terms" CTA. Clicking POSTs /api/legal/accept and the
 * banner unmounts.
 *
 * Design notes:
 *   - Non-blocking by design. We don't want a modal that scares people
 *     away mid-task. The banner stays visible until accepted; the next
 *     paid run will also re-stamp consent via /api/checkout. See ADR-0011.
 *   - Quiet on unauthenticated pages — fetch returns 401 and we render
 *     null.
 *   - "Review changes" link goes to /terms; the user can read before
 *     accepting. We don't track read-time; the click of Accept is the
 *     binding event.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { TERMS_VERSION } from "@/lib/legal";

interface ConsentState {
  loaded: boolean;
  needsReconsent: boolean;
  accepting: boolean;
  accepted: boolean;
  error: string | null;
}

export function TermsConsentBanner(): React.ReactElement | null {
  const [state, setState] = useState<ConsentState>({
    loaded: false,
    needsReconsent: false,
    accepting: false,
    accepted: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const res = await fetch("/api/legal/me", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setState((s) => ({ ...s, loaded: true }));
          return;
        }
        const data = (await res.json()) as { latestTermsVersion: string | null };
        if (cancelled) return;
        const needs = data.latestTermsVersion !== TERMS_VERSION;
        setState((s) => ({ ...s, loaded: true, needsReconsent: needs }));
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loaded: true }));
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, []);

  async function accept(): Promise<void> {
    setState((s) => ({ ...s, accepting: true, error: null }));
    try {
      const res = await fetch("/api/legal/accept", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState((s) => ({ ...s, accepting: false, accepted: true, needsReconsent: false }));
    } catch (err) {
      setState((s) => ({
        ...s,
        accepting: false,
        error: err instanceof Error ? err.message : "Could not save acceptance.",
      }));
    }
  }

  if (!state.loaded || !state.needsReconsent || state.accepted) return null;

  return (
    <div
      role="region"
      aria-label="Terms update"
      className="border-outline-variant/60 bg-surface-container-low/95 sticky top-[52px] z-20 border-b px-6 py-2.5 backdrop-blur md:px-10"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 text-[11.5px]">
        <p className="text-on-surface-variant max-w-[60ch] leading-relaxed">
          <span className="text-on-surface font-medium">Our Terms have been updated.</span> The
          substance of how we charge, retain data, and limit liability hasn&apos;t changed
          materially — please take a look and confirm to continue.
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/terms"
            className="text-on-surface-variant hover:text-on-surface underline-offset-2 hover:underline"
          >
            Review changes
          </Link>
          <button
            type="button"
            onClick={(): void => void accept()}
            disabled={state.accepting}
            className="bg-primary text-on-primary hover:bg-primary/90 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
          >
            {state.accepting ? "Saving…" : "Accept updated terms"}
          </button>
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="text-error mt-1 text-center text-[10.5px]">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
