"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

/* ---------------------------------------------------------------------------
 * <AppShell> — the chrome for every authenticated screen.
 *
 * One sticky header, one canvas backdrop, one place to change the navigation
 * model. Pages render their content as children; the shell owns nothing
 * beyond chrome + spacing.
 *
 * Active route is highlighted automatically via `usePathname()`.
 * The "New brief" CTA in the header is hidden when the user is already on
 * /brief (that page has its own sticky &quot;Run brief&quot; action bar).
 * ------------------------------------------------------------------------- */

const NAV: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/brief", label: "New brief" },
  { href: "/billing", label: "Billing" },
];

export function AppShell({
  pageLabel,
  children,
}: {
  pageLabel: string;
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const onBrief = pathname === "/brief";
  return (
    <div className="bg-surface text-on-surface relative min-h-dvh w-full overflow-x-hidden">
      {/* Canvas backdrop — same language as the public surfaces. */}
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

      <header className="border-outline-variant/60 bg-surface/80 sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-6 py-3 backdrop-blur md:px-10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
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
          <span className="text-on-surface-variant text-[11px]">· {pageLabel}</span>
        </div>

        <nav className="flex items-center gap-1 text-[11.5px]">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`hidden rounded-full px-3 py-1.5 font-medium transition-colors md:inline ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:bg-on-surface/[0.04] hover:text-on-surface"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <ThemeToggle />
          {onBrief ? null : (
            <Link href="/brief">
              <Button className="ml-1 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold">
                New run +
              </Button>
            </Link>
          )}
        </nav>
      </header>

      {children}
    </div>
  );
}
