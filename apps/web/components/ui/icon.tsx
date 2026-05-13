import { cn } from "@/lib/utils/cn";

/**
 * Material Symbols icon. Variable font is loaded once in `app/layout.tsx`.
 * Use M3 Symbols names: https://fonts.google.com/icons
 *
 * Default fill/weight/grade/optical-size match M3 Expressive defaults.
 */
export function Icon({
  name,
  className,
  filled = false,
  size = 24,
  ...rest
}: {
  name: string;
  className?: string;
  filled?: boolean;
  size?: 20 | 24 | 40 | 48;
} & React.HTMLAttributes<HTMLSpanElement>): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn("material-symbols-rounded select-none leading-none", className)}
      style={{
        fontSize: `${size}px`,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      }}
      {...rest}
    >
      {name}
    </span>
  );
}
