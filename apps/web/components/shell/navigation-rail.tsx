"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";

type NavItem = { href: string; label: string; icon: string };

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/runs/new", label: "New", icon: "edit_square" },
  { href: "/runs", label: "Runs", icon: "history" },
  { href: "/account", label: "Account", icon: "account_circle" },
];

/**
 * M3 navigation rail — vertical on desktop, hidden on mobile (replaced by
 * a bottom navigation bar in a future increment).
 */
export function NavigationRail(): React.ReactElement {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="hidden h-dvh w-20 shrink-0 flex-col items-center gap-2 border-r border-outline-variant bg-surface py-4 md:flex"
    >
      <Link
        href="/"
        aria-label="TESSAR home"
        className="mb-4 flex size-10 items-center justify-center rounded-md-shape bg-primary text-on-primary"
      >
        <span className="text-title-md font-semibold">T</span>
      </Link>
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex w-16 flex-col items-center gap-1 rounded-lg-shape py-2",
              "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                active
                  ? "bg-secondary-container text-on-secondary-container"
                  : "group-hover:bg-on-surface/8",
              )}
            >
              <Icon name={item.icon} size={24} filled={active} />
            </span>
            <span className="text-label-md">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
