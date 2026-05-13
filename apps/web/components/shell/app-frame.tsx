import { NavigationRail } from "@/components/shell/navigation-rail";

/**
 * Authenticated app frame: vertical rail on desktop + main content area.
 * Top app bar is rendered per-route by individual screens.
 */
export function AppFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex min-h-dvh bg-surface text-on-surface">
      <NavigationRail />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
