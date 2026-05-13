"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { Icon } from "@/components/ui/icon";

/**
 * Cycles light → dark → system. Uses Material Symbols for the icon so the
 * glyph stays in step with the rest of the UI's icon language.
 */
export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch — render a neutral placeholder until mounted.
  if (!mounted) {
    return <IconButton aria-label="Toggle theme" variant="standard" disabled icon="contrast" />;
  }

  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const iconName =
    theme === "system" ? "contrast" : resolvedTheme === "dark" ? "dark_mode" : "light_mode";

  return (
    <IconButton
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
      variant="standard"
      onClick={() => setTheme(next)}
      icon={iconName}
    />
  );
}
