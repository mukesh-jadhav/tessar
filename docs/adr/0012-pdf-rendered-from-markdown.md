# ADR-0012: PDF Rendered From Markdown + Inline HTML/SVG, Never From the React Tree

- **Status:** Accepted
- **Date:** 2026-05-18
- **Owners:** TESSAR core
- **Related:** ADR-0002 (brand seed), ADR-0006 (agent output contract), ADR-0005 (Phase 1 mock contracts)

## Context

The `/decide/[id]` screen ships a React experience: typographic
hierarchy, four data visualisations (cost breakdown bars, cost
trajectory line chart, 3×3 risk heatmap, build-phase timeline strip),
a section pager and the editorial design language defined in our
design-language instructions.

The downloadable PDF is the actual deliverable. Users pay per run; the
PDF is what gets emailed to a CTO, attached to a board pack, or pinned
in a Notion page. After the Phase-3 redesign of the screen, the PDF
visibly fell behind — same content, none of the visualisations, plain
grayscale typography.

We considered two ways to close the gap:

1. **Option A — generate the visualisations server-side as inline
   HTML/SVG inside the existing Markdown → WeasyPrint pipeline.** No
   new services, no new dependencies; the Python `markdown` library
   passes block-level HTML through unmodified, and WeasyPrint renders
   inline SVG natively.
2. **Option B — server-render the React tree** with Puppeteer /
   Playwright / satori. Visual parity is automatic. Operational and
   eval surface area grows by a new service, a new browser dependency
   in the container image, a new flake source, and an extra LLM-eval
   harness step to score the rendered output.

## Decision

**PDFs are rendered from Markdown + inline HTML/SVG via WeasyPrint.
The React tree is never the source of truth for the printable
deliverable.**

Concretely:

- `apps/orchestrator/tessar/agents/_pdf_visuals.py` holds pure functions
  that take already-shaped `RunPackage` data and return HTML strings
  (cost breakdown, cost trajectory SVG, risk heatmap, build timeline,
  decision summary strip).
- `apps/orchestrator/tessar/agents/packager.py::render_markdown` splices
  those strings into the Markdown document at the matching section
  boundaries. The Markdown export keeps them too — that's fine, it just
  becomes a more capable document.
- `apps/orchestrator/tessar/runner.py::_render_pdf` carries the
  editorial stylesheet (serif headlines, brand-tinted table headers,
  blockquote treatment, page footer) that mirrors the screen's design
  tokens within WeasyPrint's CSS subset.

## Consequences

### Positive

- **Zero new infra.** No Chromium in the orchestrator image, no extra
  service, no extra OIDC boundary, no extra restart-on-OOM logic.
- **Trivially testable.** Visual helpers are pure functions of `RunPackage`
  data; they can be asserted on with `assert "fragment" in html`.
- **Cloud-portable.** WeasyPrint is the only PDF dependency and it ships
  the same on any Linux base image, consistent with our cloud-portability
  rule in the architecture instructions.
- **Source-of-truth stays in the agent.** Visuals can never drift from
  the structured `RunPackage` — they're computed from it.

### Negative

- **Two render paths.** Any new visualisation added to `/decide/[id]`
  must be mirrored as an HTML/SVG helper. This is the price we
  consciously pay; the alternative was running React on the server.
- **WeasyPrint CSS subset.** No CSS grid, limited flex behaviour, no
  external fonts without embedding. Visual parity with the screen is
  approximate, not pixel-perfect.

### Process rule

When adding a screen visualisation that conveys information not already
captured in the Markdown body, you MUST:

1. Add a generator function to `_pdf_visuals.py` that takes structured
   `RunPackage` data and returns an HTML string.
2. Splice the call into `render_markdown` at the corresponding section.
3. Add an existence assertion to the packager test suite so the visual
   can't silently disappear from the PDF pipeline.
4. Add a short "Phase X — PDF parity" note to the PR description so
   reviewers see the screen ↔ PDF mapping was considered.

PRs that ship a screen-only visualisation without a PDF mirror are
rejected.

## Alternatives considered

- **Puppeteer/Playwright print-to-PDF.** Most accurate visually, but
  adds a 200 MB Chromium dependency, a second long-running process,
  network coupling between orchestrator and renderer, and a class of
  flake (browser crashes, font-loading races) we have no other reason
  to absorb.
- **Vercel `satori` + `@resvg/resvg`.** Lighter than Puppeteer but
  Node-only; the orchestrator is Python and we are not splitting
  rendering across two runtimes for one artifact.
- **`react-pdf`.** Would require keeping a parallel React-PDF
  component tree mirroring the screen. Same drift problem as Option B
  with none of its visual upside.

## Revisit when

- WeasyPrint hits a hard wall on a needed visualisation (e.g. truly
  interactive charts, but those are PDF-meaningless anyway), OR
- a paying customer asks for branded PDF templates we cannot express
  in WeasyPrint's CSS subset, OR
- the visual drift between screen and PDF grows beyond ~25 % of new
  visualisations slipping the PDF mirror.
