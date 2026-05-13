"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";

import { Icon } from "@/components/ui/icon";
import { springs } from "@/lib/motion/springs";
import { cn } from "@/lib/utils/cn";

const iconButtonStyles = cva(
  [
    "relative inline-flex items-center justify-center select-none",
    "rounded-full transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        standard: "text-on-surface-variant hover:bg-on-surface/8 active:bg-on-surface/12",
        filled: "bg-primary text-on-primary hover:bg-primary/90 active:bg-primary/80",
        tonal:
          "bg-secondary-container text-on-secondary-container hover:bg-secondary-container/85",
        outlined:
          "border border-outline text-on-surface-variant hover:bg-on-surface/8 active:bg-on-surface/12",
      },
      size: {
        sm: "size-10 [&>span]:!text-[20px]",
        md: "size-12",
        lg: "size-14 [&>span]:!text-[28px]",
      },
    },
    defaultVariants: { variant: "standard", size: "md" },
  },
);

export type IconButtonProps = Omit<HTMLMotionProps<"button">, "size"> &
  VariantProps<typeof iconButtonStyles> & {
    icon: string;
    /** Required — icon-only buttons must have an accessible name. */
    "aria-label": string;
  };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant, size, icon, type = "button", ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.92 }}
      transition={springs.expressiveFast}
      className={cn(iconButtonStyles({ variant, size }), className)}
      {...props}
    >
      <Icon name={icon} />
    </motion.button>
  );
});
