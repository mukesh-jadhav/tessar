"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * M3 outlined text field. The label floats up via CSS only — no JS, no
 * layout shift. Container shape token: `xs-shape` (4px) per M3 spec.
 *
 * Use `error` to surface validation. Always provide a `label` for a11y.
 */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  error?: string;
  supporting?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, error, supporting, leadingIcon, trailingIcon, className, value, defaultValue, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const supportId = `${inputId}-support`;
  const [hasValue, setHasValue] = useState<boolean>(
    Boolean(value ?? defaultValue ?? props.placeholder),
  );

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "relative flex h-14 items-center rounded-xs-shape border bg-transparent transition-colors",
          "border-outline focus-within:border-primary focus-within:border-2",
          error && "border-error focus-within:border-error",
        )}
      >
        {leadingIcon ? (
          <span className="pl-3 pr-1 text-on-surface-variant">{leadingIcon}</span>
        ) : null}
        <div className="relative flex-1">
          <label
            htmlFor={inputId}
            className={cn(
              "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 origin-left",
              "text-on-surface-variant transition-all duration-150 ease-out",
              "peer-focus:top-0 peer-focus:left-3 peer-focus:scale-75 peer-focus:px-1 peer-focus:bg-surface peer-focus:text-primary",
              hasValue && "top-0 left-3 scale-75 px-1 bg-surface",
              error && "text-error peer-focus:text-error",
            )}
          >
            {label}
          </label>
          <input
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error || supporting ? supportId : undefined}
            onChange={(e) => {
              setHasValue(Boolean(e.target.value));
              props.onChange?.(e);
            }}
            className={cn(
              "peer h-full w-full rounded-xs-shape bg-transparent px-4",
              "text-on-surface placeholder:text-transparent outline-none",
            )}
            {...props}
          />
        </div>
        {trailingIcon ? (
          <span className="pl-1 pr-3 text-on-surface-variant">{trailingIcon}</span>
        ) : null}
      </div>
      {(error || supporting) && (
        <span
          id={supportId}
          className={cn("px-4 text-xs", error ? "text-error" : "text-on-surface-variant")}
        >
          {error ?? supporting}
        </span>
      )}
    </div>
  );
});
