import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

/**
 * M3 Card. Variants: elevated, filled, outlined.
 * Uses the M3 Expressive `lg-shape` token (16px corners).
 */
const cardStyles = cva(["rounded-lg-shape transition-shadow"], {
  variants: {
    variant: {
      elevated: "bg-surface-container-low shadow-sm hover:shadow-md",
      filled: "bg-surface-container-highest",
      outlined: "bg-surface border border-outline-variant",
    },
    interactive: {
      true: "cursor-pointer hover:bg-surface-container active:bg-surface-container-high",
      false: "",
    },
  },
  defaultVariants: { variant: "elevated", interactive: false },
});

export const Card = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardStyles>
>(function Card({ className, variant, interactive, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(cardStyles({ variant, interactive }), className)}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn("flex flex-col gap-1 p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
  return (
    <h3 className={cn("text-lg font-semibold tracking-tight text-on-surface", className)} {...props} />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return <p className={cn("text-sm text-on-surface-variant", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn("px-4 pb-4 text-on-surface", className)} {...props} />;
}

export function CardActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn("flex items-center justify-end gap-2 p-2", className)} {...props} />;
}
