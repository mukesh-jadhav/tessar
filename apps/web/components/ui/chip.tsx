"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";

import { Icon } from "@/components/ui/icon";
import { springs } from "@/lib/motion/springs";
import { cn } from "@/lib/utils/cn";

/**
 * M3 Chip. Variants: assist, filter, input, suggestion.
 * `selected` controls the M3 selected state; pair with `onClick` for filter chips.
 */
const chipStyles = cva(
  [
    "inline-flex items-center gap-2 select-none whitespace-nowrap",
    "h-8 px-3 rounded-sm-shape border text-sm font-medium",
    "transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    "disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        assist:
          "bg-transparent border-outline text-on-surface hover:bg-on-surface/8",
        filter:
          "bg-transparent border-outline text-on-surface-variant hover:bg-on-surface/8",
        input:
          "bg-surface-container-low border-transparent text-on-surface-variant hover:bg-surface-container",
        suggestion:
          "bg-transparent border-outline text-on-surface-variant hover:bg-on-surface/8",
      },
      selected: {
        true: "!bg-secondary-container !text-on-secondary-container !border-transparent",
        false: "",
      },
    },
    defaultVariants: { variant: "assist", selected: false },
  },
);

export type ChipProps = Omit<HTMLMotionProps<"button">, "type" | "children"> &
  VariantProps<typeof chipStyles> & {
    leadingIcon?: string;
    trailingIcon?: string;
    children?: React.ReactNode;
  };

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { className, variant, selected, leadingIcon, trailingIcon, children, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={{ scale: 0.94 }}
      transition={springs.expressiveFast}
      aria-pressed={selected ?? undefined}
      className={cn(chipStyles({ variant, selected }), className)}
      {...props}
    >
      {selected ? <Icon name="check" size={20} /> : leadingIcon ? <Icon name={leadingIcon} size={20} /> : null}
      <span>{children}</span>
      {trailingIcon ? <Icon name={trailingIcon} size={20} /> : null}
    </motion.button>
  );
});
