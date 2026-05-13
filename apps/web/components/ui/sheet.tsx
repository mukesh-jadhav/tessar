"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

import { springs } from "@/lib/motion/springs";
import { cn } from "@/lib/utils/cn";

/**
 * M3 bottom sheet. Slides up from the bottom on mobile, becomes a centered
 * surface on >= md screens. Backdrop dims with a scrim. Press Escape or
 * click the scrim to dismiss.
 *
 * For dialogs/modals later, this same component is the primitive.
 */
export function Sheet({
  open,
  onClose,
  children,
  ariaLabel,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel: string;
  className?: string;
}): React.ReactElement {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
        >
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-scrim/50 backdrop-blur-sm cursor-default"
            style={{ backgroundColor: "rgb(var(--md-sys-color-scrim) / 0.5)" }}
          />
          <motion.div
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.6 }}
            transition={springs.expressiveDefault}
            className={cn(
              "relative w-full max-w-lg",
              "rounded-t-xl-shape md:rounded-xl-shape",
              "bg-surface-container-high text-on-surface shadow-xl",
              "p-6",
              className,
            )}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-on-surface-variant/40 md:hidden" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
