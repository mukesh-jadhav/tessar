"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";

import { springs } from "@/lib/motion/springs";
import { cn } from "@/lib/utils/cn";

/**
 * Editorial Button.
 *
 * Variants per ADR-0003: `filled` (accent CTA), `inverted` (ink-on-surface,
 * Vercel/Linear style), `outlined` (hairline), `text` (ghost). The legacy
 * M3 `tonal` and `elevated` variants are retained as soft aliases for
 * backward compatibility with the showcase page only.
 *
 * Shape: 8px radius (`rounded-lg`) per ADR-0003. NOT the M3 full pill.
 */
const buttonStyles = cva(
  [
    "relative inline-flex items-center justify-center gap-2 select-none",
    "font-sans font-medium tracking-tight whitespace-nowrap",
    "rounded-lg transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        filled: "bg-primary text-on-primary hover:bg-primary/90 active:bg-primary/80",
        inverted:
          "bg-on-surface text-surface hover:bg-on-surface/90 active:bg-on-surface/80",
        outlined:
          "border border-outline-variant text-on-surface bg-transparent hover:bg-surface-container-low active:bg-surface-container",
        text: "text-on-surface bg-transparent hover:bg-surface-container-low active:bg-surface-container px-3",
        // legacy aliases (showcase only) — mapped to editorial styles
        tonal:
          "bg-surface-container text-on-surface hover:bg-surface-container-high active:bg-surface-container-highest",
        elevated:
          "bg-surface text-on-surface border border-outline-variant hover:bg-surface-container-low",
      },
      size: {
        xs: "h-9 px-4 text-sm",
        sm: "h-10 px-5 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-base",
      },
    },
    defaultVariants: { variant: "filled", size: "sm" },
  },
);

export type ButtonProps = Omit<HTMLMotionProps<"button">, "size"> &
  VariantProps<typeof buttonStyles>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.97 }}
      transition={springs.expressiveFast}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
});
