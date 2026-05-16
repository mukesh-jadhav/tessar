"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { signOutAction } from "@/app/actions/auth-actions";

/* ---------------------------------------------------------------------------
 * <UserMenu /> — Profile + sign-out dropdown for the authenticated chrome.
 *
 * Lives in the top-right of <AppShell>. Renders a circular avatar with
 * the first letter of the user's email. Click → popover with:
 *   - Full email
 *   - "Billing" link
 *   - "Sign out" (server action → /)
 *
 * Session is read once on mount from /api/auth/session (Auth.js v5 built-
 * in route). We deliberately don't ship a SessionProvider — fetching once
 * per page is cheap and keeps the component dependency-free.
 *
 * Renders a quiet "Sign in" link if there is no session (e.g. signed-out
 * user lands on a public page that still uses AppShell).
 * ------------------------------------------------------------------------- */

interface SessionUser {
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

export function UserMenu(): React.ReactElement | null {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const data = (await res.json()) as { user?: SessionUser } | null;
        if (!cancelled) {
          setUser(data?.user ?? null);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, []);

  // Close the popover on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return (): void => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!loaded) {
    // Reserve space so the header doesn't jump.
    return <span aria-hidden className="size-7" />;
  }

  if (!user?.email) {
    return (
      <Link
        href="/signin"
        className="text-on-surface-variant hover:text-on-surface rounded-full px-3 py-1.5 text-[11.5px] font-medium"
      >
        Sign in
      </Link>
    );
  }

  const initial = (user.name ?? user.email)?.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(): void => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="bg-primary text-on-primary hover:bg-primary/90 grid size-7 place-items-center rounded-full text-[11.5px] font-semibold shadow-[0_4px_14px_-6px_rgb(var(--md-sys-color-primary)/0.5)] transition-colors"
      >
        {initial}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="border-outline-variant/60 bg-surface-container-high/95 absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border shadow-[0_24px_60px_-30px_rgb(0_0_0/0.35)] backdrop-blur"
        >
          <div className="border-outline-variant/60 border-b px-4 py-3">
            <p className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-[0.14em]">
              Signed in as
            </p>
            <p
              className="text-on-surface mt-1 truncate text-[12.5px] font-medium"
              title={user.email}
            >
              {user.email}
            </p>
            {user.name ? (
              <p className="text-on-surface-variant mt-0.5 truncate text-[11px]">{user.name}</p>
            ) : null}
          </div>

          <div className="py-1">
            <Link
              href="/dashboard"
              role="menuitem"
              onClick={(): void => setOpen(false)}
              className="text-on-surface hover:bg-on-surface/[0.04] flex items-center gap-2 px-4 py-2 text-[12.5px]"
            >
              <span aria-hidden className="text-on-surface-variant">
                ▦
              </span>
              Dashboard
            </Link>
            <Link
              href="/billing"
              role="menuitem"
              onClick={(): void => setOpen(false)}
              className="text-on-surface hover:bg-on-surface/[0.04] flex items-center gap-2 px-4 py-2 text-[12.5px]"
            >
              <span aria-hidden className="text-on-surface-variant">
                $
              </span>
              Billing &amp; invoices
            </Link>
          </div>

          <form action={signOutAction} className="border-outline-variant/60 border-t">
            <button
              type="submit"
              role="menuitem"
              className="text-on-surface hover:bg-on-surface/[0.04] flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12.5px] font-medium"
            >
              <span aria-hidden className="text-on-surface-variant">
                ↩
              </span>
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
