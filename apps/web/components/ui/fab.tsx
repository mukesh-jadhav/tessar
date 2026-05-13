"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";

import { Icon } from "@/components/ui/icon";
import { springs } from "@/lib/motion/springs";
import { cn } from "@/lib/utils/cn";

/**
 * M3 Expressive Floating Action Button.
 *
 * Sizes follow Expressive spec: small (40), regular (56), large (96), extended.
 * Default container shape is the M3 large shape (16px); FAB on press scales
 * subtly with an expressive spring.
 */
const fabStyles = cva(
  [
    "inline-flex items-center justify-center select-none gap-3",
    "shadow-md hover:shadow-lg transition-shadow",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-40",
    "font-sans font-medium",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary-container text-on-primary-container hover:bg-primary-container/90",
        secondary:
          "bg-secondary-container text-on-secondary-container hover:bg-secondary-container/90",
        tertiary:
          "bg-tertiary text-on-tertiary hover:bg-tertiary/90",
        surface:
          "bg-surface-container-high text-primary hover:bg-surface-container-highest",
      },
      size: {
        sm: "size-10 rounded-md-shape [&>span]:!text-[24px]",
        md: "size-14 rounded-lg-shape [&>span]:!text-[24px]",
        lg: "size-24 rounded-xl-shape [&>span]:!text-[36px]",
        extended: "h-14 rounded-lg-shape px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type BaseFabProps = Omit<HTMLMotionProps<"button">, "size"> & VariantProps<typeof fabStyles>;

export type FabProps = BaseFabProps &
  (
    | { icon: string; label?: string; "aria-label": string }
    | { icon: string; label: string; "aria-label"?: string }
  );

export const Fab = forwardRef<HTMLButtonElement, FabProps>(function Fab(
  { className, variant, size, icon, label, type = "button", ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={springs.expressiveDefault}
      className={cn(fabStyles({ variant, size }), className)}
      {...props}
    >
      <Icon name={icon} />
      {label ? <span>{label}</span> : null}
    </motion.button>
  );
});
