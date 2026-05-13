"use client";

import { MotionConfig } from "motion/react";

/**
 * Honor `prefers-reduced-motion: reduce` for every motion/react animation
 * in the tree. CSS `transition-duration: 0.01ms` in globals.css already
 * collapses CSS-based animations; this catches the JS-driven ones.
 *
 * `reducedMotion="user"` reads the OS-level user preference.
 */
export function MotionPreferences({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
