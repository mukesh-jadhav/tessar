"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
 * <RouteProgress /> — thin top-of-page progress bar that flashes on every
 * client-side route change.
 *
 * Listens to `usePathname()` changes. When the path flips, runs a quick
 * fill-and-fade animation (~400ms) so the user gets visual confirmation
 * that navigation actually happened. Pure CSS transitions, no deps.
 *
 * Lives in the root layout so every page benefits with zero per-page
 * wiring. Hidden when the user prefers reduced motion.
 * ------------------------------------------------------------------------- */

export function RouteProgress(): React.ReactElement | null {
  const pathname = usePathname();
  const [stage, setStage] = useState<"idle" | "loading" | "done">("idle");
  const firstRender = useRef(true);

  useEffect(() => {
    // Don't fire on initial mount — only on subsequent route changes.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStage("loading");
    const t1 = window.setTimeout(() => setStage("done"), 320);
    const t2 = window.setTimeout(() => setStage("idle"), 700);
    return (): void => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pathname]);

  if (stage === "idle") return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px] motion-reduce:hidden"
    >
      <div
        className="bg-primary h-full origin-left"
        style={{
          width: stage === "loading" ? "70%" : "100%",
          transition:
            stage === "loading"
              ? "width 320ms cubic-bezier(0.4, 0, 0.2, 1)"
              : "width 200ms ease-out, opacity 300ms ease-out",
          opacity: stage === "done" ? 0 : 1,
          boxShadow: "0 0 12px rgb(var(--md-sys-color-primary) / 0.55)",
        }}
      />
    </div>
  );
}
