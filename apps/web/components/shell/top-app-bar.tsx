import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * Editorial top app bar — small variant. Sticky to top of the viewport.
 * Hairline bottom border, no glass blur. Use on app surfaces (dashboard, run pages).
 * For marketing, use `<MarketingNav />`.
 */
export function TopAppBar({
  title,
  trailing,
  leading,
  className,
}: {
  title: React.ReactNode;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-outline-variant",
        "bg-surface px-4",
        className,
      )}
    >
      {leading}
      <h1 className="flex-1 truncate text-sm font-semibold tracking-tight text-on-surface">
        {title}
      </h1>
      <div className="flex items-center gap-1">{trailing}</div>
    </header>
  );
}

/**
 * Marketing top nav — hairline bottom border, plain text nav with one rounded-full
 * active pill (Greenlight-style). No glass blur, no decorative gradients.
 */
export function MarketingNav({ active = "decide" }: { active?: "decide" | "library" | "pricing" }): React.ReactElement {
  const items = [
    { id: "decide" as const, label: "Decide", href: "/" },
    { id: "library" as const, label: "Library", href: "/#sample" },
    { id: "pricing" as const, label: "Pricing", href: "/#pricing" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-on-surface"
        >
          <span
            aria-hidden
            className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-on-primary"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2.5 6.2L4.8 8.5L9.5 3.8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          TESSAR
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {items.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                active === it.id
                  ? "bg-surface-container text-on-surface"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {it.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/signin" className="hidden md:inline-flex">
            <Button variant="outlined" size="xs">
              Sign in
            </Button>
          </Link>
          <Link href="/signin">
            <Button variant="filled" size="xs">
              Start a brief
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
