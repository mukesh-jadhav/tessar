"use client";

/**
 * <MermaidBlock /> — client-side Mermaid renderer.
 *
 * Lazy-loads the mermaid library on mount so the ~600 KB chunk only
 * lands when a user actually opens a screen that displays diagrams
 * (currently /decide → System design tab). The fenced source stays
 * available as the rendered SVG's `<title>` plus an opt-in "View source"
 * disclosure, so nothing is hidden from the user.
 *
 * Errors are surfaced inline (no silent fallback) — if Mermaid can't
 * parse the source we say so, with the verbatim source visible.
 */

import { useEffect, useRef, useState } from "react";

import { mermaidTheme } from "@/lib/diagrams/mermaid-theme";

interface Props {
  /** Stable id for the diagram (used as the SVG's DOM id). */
  id: string;
  /** Verbatim Mermaid source (e.g. `flowchart LR\n  A --> B`). */
  source: string;
  /** Optional className for the wrapping <div>. */
  className?: string;
}

interface RenderState {
  status: "idle" | "rendering" | "ok" | "error";
  svg?: string;
  error?: string;
}

export function MermaidBlock({ id, source, className }: Props): React.ReactElement {
  const [state, setState] = useState<RenderState>({ status: "idle" });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setState({ status: "rendering" });
    let mounted = true;

    void (async () => {
      try {
        const mod = await import("mermaid");
        if (cancelled.current || !mounted) return;
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          fontFamily: mermaidTheme.themeVariables.fontFamily,
          theme: mermaidTheme.theme,
          themeVariables: mermaidTheme.themeVariables,
        });
        // mermaid.render returns { svg, bindFunctions? }
        const safeId = `mmd-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const { svg } = await mermaid.render(safeId, source);
        if (cancelled.current || !mounted) return;
        setState({ status: "ok", svg });
      } catch (err) {
        if (cancelled.current || !mounted) return;
        const msg = err instanceof Error ? err.message : "Failed to render diagram.";
        setState({ status: "error", error: msg });
      }
    })();

    return () => {
      cancelled.current = true;
      mounted = false;
    };
  }, [id, source]);

  return (
    <div className={className ?? ""}>
      {state.status === "rendering" || state.status === "idle" ? (
        <div
          role="status"
          aria-live="polite"
          className="text-on-surface-variant border-outline-variant/60 rounded-lg border border-dashed p-6 text-center text-[12px]"
        >
          Rendering diagram…
        </div>
      ) : null}
      {state.status === "ok" && state.svg ? (
        // Mermaid produces sanitized SVG when securityLevel === "strict";
        // dangerouslySetInnerHTML is the standard pattern documented by
        // the library and is safe under that mode.
        <div
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: state.svg }}
          className="bg-surface-container/60 overflow-x-auto rounded-lg p-3 [&_svg]:mx-auto [&_svg]:!h-auto [&_svg]:max-w-full"
        />
      ) : null}
      {state.status === "error" ? (
        <div
          role="alert"
          className="border-error/40 bg-error-container/30 text-on-error-container rounded-lg border p-3 text-[12px]"
        >
          <p className="font-medium">Could not render diagram.</p>
          <p className="mt-1 opacity-80">{state.error}</p>
        </div>
      ) : null}
      <details className="mt-2">
        <summary className="text-on-surface-variant cursor-pointer text-[11px] uppercase tracking-wide opacity-70 hover:opacity-100">
          View Mermaid source
        </summary>
        <pre className="bg-surface-container text-on-surface-variant mt-2 max-h-[420px] overflow-auto rounded-lg p-3 text-[11px] leading-relaxed">
          {source}
        </pre>
      </details>
    </div>
  );
}
