"""PDF-only visual widgets — HTML + inline SVG generators.

These helpers exist because the PDF artifact is rendered through the
Markdown → HTML → WeasyPrint pipeline in ``runner._render_pdf``, NOT
through the React tree at ``/decide/[id]``. Anything visual that has to
appear in the downloadable PDF lives here and is spliced into
``render_markdown(pkg)`` as raw HTML/SVG (the Python ``markdown`` library
passes block-level HTML through unmodified when no safe-mode flag is
set).

Design constraints:

* **Self-contained.** Every function takes already-shaped package data
  (no DB, no IO) and returns a single HTML string. Trivially testable.
* **WeasyPrint-safe.** Inline ``style`` attributes only — WeasyPrint's
  CSS support is solid for the modern subset we use here (flex, grid,
  SVG, viewBox, transforms). No external assets, no fonts, no images.
* **Print-first palette.** Brand seed ``#137333`` (ADR-0002). Greys
  picked for ink-cost legibility, not screen contrast.
* **Honest with sparse data.** If the upstream agent didn't emit the
  data needed for a widget, the function returns an empty string and
  the packager skips the section header too.

See ADR-0012 for the wider "PDF is rendered from Markdown + HTML, never
from the React tree" contract.
"""

from __future__ import annotations

import html
from collections.abc import Sequence

from tessar.schemas.run_package import (
    PackageBomLine,
    PackageBuildPhase,
    PackageRisk,
)

# ─── shared palette ─────────────────────────────────────────────────────
# Centralised so the ADR-0002 brand seed is the only thing to change
# when re-skinning. Greys tuned for greyscale-printer legibility.

_BRAND = "#137333"
_BRAND_SOFT = "#E6F2EB"
_INK = "#1F1F1F"
_INK_MUTED = "#5F6368"
_SURFACE = "#F8F9FA"
_BORDER = "#E8EAED"
_DANGER = "#B3261E"
_WARNING = "#9C7C00"

# Severity / likelihood ordering used everywhere a 3×3 grid is drawn.
_SEV_ORDER = ["low", "med", "high"]
_SEV_LABEL = {"low": "Low", "med": "Med", "high": "High"}


# ─── cost breakdown ────────────────────────────────────────────────────


def cost_breakdown_html(bom: Sequence[PackageBomLine], *, top_n: int = 12) -> str:
    """Horizontal bar chart of monthly cost by component.

    Sorted descending; tops out at ``top_n`` rows so a long BOM doesn't
    spill the page (the full BOM table follows in plain markdown). If
    every entry has zero base_cost we still render the structure but
    suppress the bars — better than confusing empty space.
    """
    if not bom:
        return ""
    ordered = sorted(bom, key=lambda b: b.base_cost, reverse=True)[:top_n]
    max_cost = max((b.base_cost for b in ordered), default=0.0)
    total = sum(b.base_cost for b in bom)

    rows: list[str] = []
    for b in ordered:
        pct = (b.base_cost / max_cost * 100.0) if max_cost > 0 else 0.0
        share = (b.base_cost / total * 100.0) if total > 0 else 0.0
        label = html.escape(f"{b.name}")
        kind = html.escape(b.kind)
        rows.append(
            f"""<div style="display:flex;align-items:baseline;gap:8pt;margin:3pt 0;">
  <div style="flex:0 0 38%;font-size:9.5pt;color:{_INK};white-space:nowrap;
              overflow:hidden;text-overflow:ellipsis;">
    <span style="color:{_INK_MUTED};font-variant:small-caps;font-size:8pt;">{kind}</span>
    &nbsp;{label}
  </div>
  <div style="flex:1;height:8pt;background:{_SURFACE};border:1px solid {_BORDER};
              border-radius:2pt;overflow:hidden;">
    <div style="width:{pct:.1f}%;height:100%;background:{_BRAND};"></div>
  </div>
  <div style="flex:0 0 78pt;text-align:right;font-size:9pt;color:{_INK};
              font-variant-numeric:tabular-nums;white-space:nowrap;">
    ${b.base_cost:,.0f}
    <span style="color:{_INK_MUTED};font-size:8pt;">&nbsp;{share:.0f}%</span>
  </div>
</div>"""
        )

    omitted = len(bom) - len(ordered)
    footer = ""
    if omitted > 0:
        footer = (
            f'<p style="margin:6pt 0 0;font-size:8.5pt;color:{_INK_MUTED};">'
            f"+ {omitted} additional line items in the full bill of materials below."
            "</p>"
        )

    return f"""
<div style="margin:8pt 0 14pt;padding:10pt 12pt;border:1px solid {_BORDER};
            border-radius:6pt;background:#fff;page-break-inside:avoid;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;
              margin-bottom:6pt;border-bottom:1px solid {_BORDER};padding-bottom:4pt;">
    <span style="font-size:9pt;font-variant:small-caps;letter-spacing:0.06em;
                 color:{_INK_MUTED};">Cost breakdown · monthly USD</span>
    <span style="font-size:10pt;color:{_INK};font-variant-numeric:tabular-nums;">
      Total <strong>${total:,.0f}</strong>/mo
    </span>
  </div>
  {"".join(rows)}
  {footer}
</div>
"""


# ─── cost trajectory ───────────────────────────────────────────────────


def cost_trajectory_svg(bom: Sequence[PackageBomLine]) -> str:
    """Single-line SVG chart projecting monthly cost across scale factors.

    X-axis: scale multiplier (1×, 3×, 10×, 30×, 100× of today's load).
    Y-axis: projected monthly cost in USD.

    Per-line projection:
      * ``fixed=True`` items stay flat.
      * Items with ``scale_exp`` apply the strongest declared exponent
        (max of users/rps/gb) to the scale multiplier; this matches how
        the cost estimator agent already documents its scaling
        heuristic (BomLine.scale_exp is "cost ≈ base * scale^exp" per
        the dominant dimension).
      * Items with no ``scale_exp`` are treated as linear (exp=1.0).

    The chart is approximate by design — its job is "at 10× users does
    my bill explode or stay tame?" not a billing forecast.
    """
    if not bom:
        return ""

    scale_points = [1.0, 3.0, 10.0, 30.0, 100.0]

    def project(scale: float) -> float:
        total = 0.0
        for b in bom:
            if b.fixed:
                total += b.base_cost
                continue
            exp = 1.0
            if b.scale_exp is not None:
                candidates = [
                    x for x in (b.scale_exp.users, b.scale_exp.rps, b.scale_exp.gb) if x is not None
                ]
                if candidates:
                    exp = max(candidates)
            total += b.base_cost * (scale**exp)
        return total

    values = [project(s) for s in scale_points]
    max_v = max(values) if values else 1.0
    if max_v <= 0:
        return ""

    # SVG viewport in user units; WeasyPrint scales to width:100%.
    w, h = 480, 180
    pad_l, pad_r, pad_t, pad_b = 48, 12, 16, 28
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b

    def x_pos(i: int) -> float:
        return pad_l + (i / (len(scale_points) - 1)) * plot_w

    def y_pos(v: float) -> float:
        return pad_t + (1 - v / max_v) * plot_h

    points = [(x_pos(i), y_pos(v)) for i, v in enumerate(values)]
    polyline = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)

    # Gridlines: 4 horizontal at quartiles.
    gridlines = "".join(
        f'<line x1="{pad_l}" y1="{pad_t + plot_h * frac:.1f}" '
        f'x2="{w - pad_r}" y2="{pad_t + plot_h * frac:.1f}" '
        f'stroke="{_BORDER}" stroke-width="0.5" />'
        for frac in (0.0, 0.25, 0.5, 0.75, 1.0)
    )

    # Y-axis tick labels at top + middle + bottom of axis.
    y_ticks = "".join(
        f'<text x="{pad_l - 6}" y="{pad_t + plot_h * frac + 3:.1f}" '
        f'font-size="8" fill="{_INK_MUTED}" text-anchor="end" '
        f'font-family="Inter,Segoe UI,sans-serif">${max_v * (1 - frac):,.0f}</text>'
        for frac in (0.0, 0.5, 1.0)
    )

    # X-axis tick labels.
    x_ticks = "".join(
        f'<text x="{x_pos(i):.1f}" y="{h - pad_b + 14}" '
        f'font-size="8" fill="{_INK_MUTED}" text-anchor="middle" '
        f'font-family="Inter,Segoe UI,sans-serif">{int(scale_points[i])}×</text>'
        for i in range(len(scale_points))
    )

    # Point dots + value labels.
    dots = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.6" fill="{_BRAND}" />'
        f'<text x="{x:.1f}" y="{y - 6:.1f}" font-size="7.5" fill="{_INK}" '
        f'text-anchor="middle" font-family="Inter,Segoe UI,sans-serif" '
        f'font-variant-numeric="tabular-nums">${values[i]:,.0f}</text>'
        for i, (x, y) in enumerate(points)
    )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"
  preserveAspectRatio="xMidYMid meet" width="100%"
  role="img" aria-label="Projected monthly cost vs. scale">
  {gridlines}
  <polyline points="{polyline}" fill="none" stroke="{_BRAND}" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round" />
  {dots}
  {y_ticks}
  {x_ticks}
  <text x="{pad_l}" y="{h - 4}" font-size="8" fill="{_INK_MUTED}"
        font-family="Inter,Segoe UI,sans-serif">Scale multiplier (× today's load)</text>
</svg>"""

    return f"""
<div style="margin:8pt 0 14pt;padding:10pt 12pt;border:1px solid {_BORDER};
            border-radius:6pt;background:#fff;page-break-inside:avoid;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;
              margin-bottom:6pt;border-bottom:1px solid {_BORDER};padding-bottom:4pt;">
    <span style="font-size:9pt;font-variant:small-caps;letter-spacing:0.06em;
                 color:{_INK_MUTED};">Cost trajectory · projected USD/mo</span>
    <span style="font-size:8.5pt;color:{_INK_MUTED};">
      Today &nbsp;<strong style="color:{_INK};">${values[0]:,.0f}</strong>
      &nbsp;→&nbsp; 100× &nbsp;<strong style="color:{_INK};">${values[-1]:,.0f}</strong>
    </span>
  </div>
  {svg}
  <p style="margin:6pt 0 0;font-size:8pt;color:{_INK_MUTED};line-height:1.4;">
    Projection assumes the dominant scale exponent declared per BOM line;
    fixed-cost components stay flat. Treat as a sensitivity check, not a forecast.
  </p>
</div>
"""


# ─── risk heatmap ──────────────────────────────────────────────────────


def risk_heatmap_html(risks: Sequence[PackageRisk]) -> str:
    """3×3 severity × likelihood grid with risk IDs placed in each cell.

    Cell shading intensifies from low/low (white) to high/high (deep
    brand). Empty cells render as plain bordered boxes so the grid
    remains scannable.
    """
    if not risks:
        return ""

    grid: dict[tuple[str, str], list[str]] = {}
    for r in risks:
        sev = r.severity if r.severity in _SEV_ORDER else "med"
        lik = r.likelihood if r.likelihood in _SEV_ORDER else "med"
        grid.setdefault((sev, lik), []).append(r.id)

    def cell_bg(sev: str, lik: str) -> str:
        rank = _SEV_ORDER.index(sev) + _SEV_ORDER.index(lik)  # 0..4
        # Map 0→very light, 4→strong brand. Discrete tints for print legibility.
        tint_map = {
            0: "#FFFFFF",
            1: "#F2F8F4",
            2: _BRAND_SOFT,
            3: "#B7DFC4",
            4: "#7CC394",
        }
        return tint_map[rank]

    def cell_text(sev: str, lik: str) -> str:
        return _INK if (_SEV_ORDER.index(sev) + _SEV_ORDER.index(lik)) <= 2 else "#0B3C1F"

    # Header row: likelihood across top.
    header_cells = "".join(
        f'<th style="padding:4pt 6pt;font-size:8pt;font-variant:small-caps;'
        f"letter-spacing:0.06em;color:{_INK_MUTED};font-weight:600;"
        f'border-bottom:1px solid {_BORDER};">{_SEV_LABEL[lik]}</th>'
        for lik in _SEV_ORDER
    )

    body_rows: list[str] = []
    for sev in reversed(_SEV_ORDER):  # high at top
        cells: list[str] = []
        for lik in _SEV_ORDER:
            ids = grid.get((sev, lik), [])
            bg = cell_bg(sev, lik)
            fg = cell_text(sev, lik)
            inner = ""
            if ids:
                badges = "".join(
                    f'<span style="display:inline-block;padding:1pt 4pt;margin:1pt;'
                    f"border-radius:2pt;background:#FFFFFF;border:1px solid {_BORDER};"
                    f'font-size:7.5pt;font-variant-numeric:tabular-nums;color:{_INK};">'
                    f"{html.escape(rid)}</span>"
                    for rid in ids
                )
                inner = (
                    f'<div style="font-size:10pt;font-weight:600;color:{fg};">{len(ids)}</div>'
                    f'<div style="margin-top:2pt;line-height:1.3;">{badges}</div>'
                )
            else:
                inner = f'<div style="font-size:9pt;color:{_INK_MUTED};opacity:0.5;">·</div>'
            cells.append(
                f'<td style="padding:6pt;background:{bg};border:1px solid {_BORDER};'
                f'vertical-align:top;text-align:center;width:25%;height:48pt;">{inner}</td>'
            )
        body_rows.append(
            f'<tr><th style="padding:4pt 6pt;font-size:8pt;font-variant:small-caps;'
            f"letter-spacing:0.06em;color:{_INK_MUTED};font-weight:600;text-align:right;"
            f'border-right:1px solid {_BORDER};">{_SEV_LABEL[sev]}</th>' + "".join(cells) + "</tr>"
        )

    # Severity / likelihood counts strip.
    sev_counts = {s: sum(1 for r in risks if r.severity == s) for s in _SEV_ORDER}
    lik_counts = {s: sum(1 for r in risks if r.likelihood == s) for s in _SEV_ORDER}

    counts_strip = (
        f'<div style="margin-top:8pt;display:flex;justify-content:space-between;'
        f'font-size:8pt;color:{_INK_MUTED};">'
        f"<span>By severity — "
        f'<strong style="color:{_INK};">{sev_counts["high"]}</strong> high · '
        f'<strong style="color:{_INK};">{sev_counts["med"]}</strong> med · '
        f'<strong style="color:{_INK};">{sev_counts["low"]}</strong> low</span>'
        f"<span>By likelihood — "
        f'<strong style="color:{_INK};">{lik_counts["high"]}</strong> high · '
        f'<strong style="color:{_INK};">{lik_counts["med"]}</strong> med · '
        f'<strong style="color:{_INK};">{lik_counts["low"]}</strong> low</span>'
        f"</div>"
    )

    return f"""
<div style="margin:8pt 0 14pt;padding:10pt 12pt;border:1px solid {_BORDER};
            border-radius:6pt;background:#fff;page-break-inside:avoid;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;
              margin-bottom:6pt;border-bottom:1px solid {_BORDER};padding-bottom:4pt;">
    <span style="font-size:9pt;font-variant:small-caps;letter-spacing:0.06em;
                 color:{_INK_MUTED};">Risk heatmap · {len(risks)} risks</span>
    <span style="font-size:8pt;color:{_INK_MUTED};">
      severity ↕ &nbsp;·&nbsp; likelihood →
    </span>
  </div>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <thead>
      <tr><th style="width:25%;"></th>{header_cells}</tr>
    </thead>
    <tbody>
      {"".join(body_rows)}
    </tbody>
  </table>
  {counts_strip}
</div>
"""


# ─── build timeline ────────────────────────────────────────────────────


def build_timeline_html(phases: Sequence[PackageBuildPhase]) -> str:
    """Horizontal strip of build phases with node-count badges.

    Renders as a flex row of card-like phase boxes. Falls back to a
    vertical stack via flex-wrap when WeasyPrint determines the row
    would overflow the page width.
    """
    if not phases:
        return ""

    boxes: list[str] = []
    for i, p in enumerate(phases, start=1):
        node_count = len(p.nodes)
        nodes_preview = ", ".join(p.nodes[:3])
        if node_count > 3:
            nodes_preview += f" + {node_count - 3} more"
        boxes.append(
            f"""<div style="flex:1 1 0;min-width:120pt;padding:8pt 10pt;
                  border:1px solid {_BORDER};border-radius:5pt;background:{_SURFACE};
                  page-break-inside:avoid;">
  <div style="display:flex;align-items:center;gap:6pt;margin-bottom:4pt;">
    <span style="display:inline-block;width:18pt;height:18pt;border-radius:50%;
                 background:{_BRAND};color:#fff;text-align:center;
                 font-size:9pt;font-weight:600;line-height:18pt;">{i}</span>
    <span style="font-size:8pt;font-variant:small-caps;letter-spacing:0.06em;
                 color:{_INK_MUTED};">{html.escape(p.label)}</span>
  </div>
  <div style="font-size:10pt;font-weight:600;color:{_INK};line-height:1.35;
              margin-bottom:3pt;">{html.escape(p.title)}</div>
  <div style="font-size:8pt;color:{_INK_MUTED};line-height:1.4;">
    <strong style="color:{_INK};">{node_count}</strong> component{"s" if node_count != 1 else ""}
    &middot; {html.escape(nodes_preview)}
  </div>
</div>"""
        )

    arrow = (
        f'<span style="flex:0 0 auto;align-self:center;color:{_INK_MUTED};'
        f'font-size:14pt;line-height:1;">→</span>'
    )
    joined: list[str] = []
    for i, box in enumerate(boxes):
        if i > 0:
            joined.append(arrow)
        joined.append(box)

    return f"""
<div style="margin:8pt 0 14pt;padding:10pt 12pt;border:1px solid {_BORDER};
            border-radius:6pt;background:#fff;page-break-inside:avoid;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;
              margin-bottom:8pt;border-bottom:1px solid {_BORDER};padding-bottom:4pt;">
    <span style="font-size:9pt;font-variant:small-caps;letter-spacing:0.06em;
                 color:{_INK_MUTED};">Build sequence · {len(phases)} phases</span>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:6pt;align-items:stretch;">
    {"".join(joined)}
  </div>
</div>
"""


# ─── decision summary strip ────────────────────────────────────────────


def decision_strip_html(decisions: Sequence) -> str:  # type: ignore[type-arg]
    """At-a-glance table of every decision with pick + confidence pill.

    Sits at the top of the Decisions section so the reader can scan the
    full set before diving into individual rationales.
    """
    if not decisions:
        return ""

    def conf_pill(conf: str) -> str:
        bg, fg = {
            "high": (_BRAND_SOFT, "#0B3C1F"),
            "med": ("#FFF6E0", _WARNING),
            "low": ("#FBE6E4", _DANGER),
        }.get(conf, (_SURFACE, _INK_MUTED))
        return (
            f'<span style="display:inline-block;padding:1pt 6pt;border-radius:8pt;'
            f"background:{bg};color:{fg};font-size:7.5pt;font-weight:600;"
            f'font-variant:small-caps;letter-spacing:0.04em;">{html.escape(conf)}</span>'
        )

    rows: list[str] = []
    for d in decisions:
        rows.append(
            f"""<tr>
  <td style="padding:5pt 6pt;border-bottom:1px solid {_BORDER};
             font-size:8.5pt;font-variant-numeric:tabular-nums;
             color:{_INK_MUTED};width:14%;vertical-align:top;">{html.escape(d.id)}</td>
  <td style="padding:5pt 6pt;border-bottom:1px solid {_BORDER};
             font-size:9.5pt;color:{_INK};vertical-align:top;">
    <div style="font-size:8pt;color:{_INK_MUTED};font-variant:small-caps;
                letter-spacing:0.05em;">{html.escape(d.topic)}</div>
    <div style="font-weight:600;margin-top:1pt;">{html.escape(d.pick)}</div>
  </td>
  <td style="padding:5pt 6pt;border-bottom:1px solid {_BORDER};
             font-size:8.5pt;color:{_INK_MUTED};vertical-align:top;">
    {html.escape(getattr(d, "reversibility", "") or "")}
  </td>
  <td style="padding:5pt 6pt;border-bottom:1px solid {_BORDER};
             vertical-align:top;text-align:right;">{conf_pill(d.conf)}</td>
</tr>"""
        )

    return f"""
<div style="margin:8pt 0 14pt;padding:10pt 12pt;border:1px solid {_BORDER};
            border-radius:6pt;background:#fff;page-break-inside:avoid;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;
              margin-bottom:6pt;border-bottom:1px solid {_BORDER};padding-bottom:4pt;">
    <span style="font-size:9pt;font-variant:small-caps;letter-spacing:0.06em;
                 color:{_INK_MUTED};">Decision summary · {len(decisions)} picks</span>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    <tbody>{"".join(rows)}</tbody>
  </table>
</div>
"""
