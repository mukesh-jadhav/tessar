/**
 * TESSAR — bespoke editorial illustrations.
 *
 * Inline SVG components used inside marketing bento cards. Each illustration
 * is content-aware: it shows actual TESSAR information (the 9 named agents,
 * the real deliverable parts, the cost-ladder shape) rather than generic art.
 *
 * Color rule: every stroke and fill must use `currentColor` or one of the
 * topic-card content colors passed via parent text color. No hex literals.
 */

/* ─────────────────────────────────────────────────────────────────────────
 * AgentGraph — the 9-agent pipeline shown as a horizontal flow with three
 * parallel research workers. Used on the "ink" research bento card.
 * ─────────────────────────────────────────────────────────────────────── */
export function AgentGraphIllustration({
  className,
}: {
  className?: string;
}): React.ReactElement {
  const nodes = [
    { id: "intake", x: 20, y: 60, label: "intake" },
    { id: "reqs", x: 80, y: 60, label: "requirements" },
    { id: "plan", x: 150, y: 60, label: "research plan" },
    { id: "w1", x: 220, y: 24, label: "worker 1" },
    { id: "w2", x: 220, y: 60, label: "worker 2" },
    { id: "w3", x: 220, y: 96, label: "worker 3" },
    { id: "synth", x: 290, y: 60, label: "synthesizer" },
    { id: "arch", x: 360, y: 60, label: "architect" },
    { id: "pkg", x: 430, y: 60, label: "packager" },
  ];
  const edges: Array<[string, string]> = [
    ["intake", "reqs"],
    ["reqs", "plan"],
    ["plan", "w1"],
    ["plan", "w2"],
    ["plan", "w3"],
    ["w1", "synth"],
    ["w2", "synth"],
    ["w3", "synth"],
    ["synth", "arch"],
    ["arch", "pkg"],
  ];
  const byId: Record<string, (typeof nodes)[number]> = Object.fromEntries(
    nodes.map((n) => [n.id, n])
  );

  return (
    <svg
      viewBox="0 0 460 130"
      className={className}
      role="img"
      aria-label="Nine-agent research pipeline: intake to packager, with three parallel research workers."
      fill="none"
    >
      {edges.map(([a, b], i) => {
        const from = byId[a]!;
        const to = byId[b]!;
        return (
          <path
            key={i}
            d={`M${from.x + 8} ${from.y} C ${from.x + 28} ${from.y}, ${to.x - 28} ${to.y}, ${to.x - 8} ${to.y}`}
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="1"
            strokeLinecap="round"
          />
        );
      })}
      {nodes.map((n) => {
        const isHero = n.id === "arch" || n.id === "pkg";
        return (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={isHero ? 6 : 4}
              fill={isHero ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.4"
            />
            {isHero && <circle cx={n.x} cy={n.y} r="2" fill="rgb(var(--md-sys-color-primary))" />}
          </g>
        );
      })}
      {/* Labels for edge nodes only — keeps composition clean */}
      <text
        x="20"
        y="118"
        fontSize="9"
        fill="currentColor"
        opacity="0.55"
        fontFamily="inherit"
      >
        intake
      </text>
      <text
        x="290"
        y="118"
        fontSize="9"
        fill="currentColor"
        opacity="0.55"
        fontFamily="inherit"
      >
        synthesizer
      </text>
      <text
        x="430"
        y="118"
        fontSize="9"
        fill="currentColor"
        opacity="0.55"
        fontFamily="inherit"
        textAnchor="end"
      >
        package
      </text>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * PackageStack — the deliverable parts as labelled stacked sheets.
 * Used on the "paper" deliverable bento card.
 * ─────────────────────────────────────────────────────────────────────── */
export function PackageStackIllustration({
  className,
}: {
  className?: string;
}): React.ReactElement {
  const sheets = [
    { y: 12, label: "Audit", w: 240 },
    { y: 28, label: "Build plan", w: 252 },
    { y: 44, label: "Risks", w: 244 },
    { y: 60, label: "Cost", w: 256 },
    { y: 76, label: "Trade-offs", w: 248 },
    { y: 92, label: "BOM", w: 260 },
    { y: 108, label: "Architecture", w: 252 },
    { y: 124, label: "Requirements", w: 264 },
    { y: 140, label: "Summary", w: 256 },
  ];
  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role="img"
      aria-label="The TESSAR design package: nine layered sections from Summary at the front to Audit at the back."
      fill="none"
    >
      {sheets.map((s, i) => (
        <g key={i}>
          <rect
            x={(320 - s.w) / 2}
            y={s.y}
            width={s.w}
            height="22"
            rx="4"
            fill="currentColor"
            fillOpacity={0.04 + i * 0.015}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="0.8"
          />
          <text
            x={(320 - s.w) / 2 + 12}
            y={s.y + 14}
            fontSize="9"
            fill="currentColor"
            opacity="0.7"
            fontFamily="inherit"
          >
            {s.label}
          </text>
          <circle
            cx={(320 + s.w) / 2 - 12}
            cy={s.y + 11}
            r="2"
            fill="rgb(var(--md-sys-color-primary))"
            opacity={i === sheets.length - 1 ? 1 : 0.4}
          />
        </g>
      ))}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * CitationWeb — claim text with numbered source markers, like a footnoted
 * book page. Used on the "linen" audit bento card.
 * ─────────────────────────────────────────────────────────────────────── */
export function CitationWebIllustration({
  className,
}: {
  className?: string;
}): React.ReactElement {
  const lines = [
    { w: 100, marks: [1] },
    { w: 88 },
    { w: 76, marks: [2] },
    { w: 92 },
    { w: 70, marks: [3] },
    { w: 84 },
    { w: 60, marks: [4, 5] },
  ];
  return (
    <svg
      viewBox="0 0 220 200"
      className={className}
      role="img"
      aria-label="Body text with numbered source citations linking to a stack of references on the right."
      fill="none"
    >
      {/* Body text lines */}
      {lines.map((l, i) => {
        const y = 20 + i * 20;
        return (
          <g key={i}>
            <line
              x1="14"
              y1={y}
              x2={14 + l.w}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.55"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {l.marks?.map((m, j) => (
              <g key={j}>
                <circle
                  cx={14 + l.w + 6 + j * 12}
                  cy={y - 3}
                  r="6"
                  fill="rgb(var(--md-sys-color-primary))"
                />
                <text
                  x={14 + l.w + 6 + j * 12}
                  y={y - 1}
                  fontSize="7"
                  fill="rgb(var(--md-sys-color-on-primary))"
                  fontFamily="inherit"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {m}
                </text>
              </g>
            ))}
          </g>
        );
      })}

      {/* Source list on the right */}
      <line
        x1="160"
        y1="14"
        x2="160"
        y2="180"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="0.8"
      />
      {[1, 2, 3, 4, 5].map((n, i) => (
        <g key={n}>
          <text
            x="170"
            y={28 + i * 28}
            fontSize="8"
            fill="currentColor"
            opacity="0.55"
            fontFamily="inherit"
            fontWeight="600"
          >
            [{n}]
          </text>
          <line
            x1="184"
            y1={25 + i * 28}
            x2="210"
            y2={25 + i * 28}
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <line
            x1="184"
            y1={31 + i * 28}
            x2="206"
            y2={31 + i * 28}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * CostLadder — three stepped bars: launch, 10×, 100×. Each bar is split
 * into stacked components (compute, db, network, llm) by the breakdown.
 * Used on the "sky" cost bento card.
 * ─────────────────────────────────────────────────────────────────────── */
export function CostLadderIllustration({
  className,
}: {
  className?: string;
}): React.ReactElement {
  const bars = [
    {
      label: "Launch",
      figure: "$184",
      x: 30,
      total: 60,
      parts: [
        { h: 18, opacity: 1 },
        { h: 14, opacity: 0.7 },
        { h: 16, opacity: 0.5 },
        { h: 12, opacity: 0.3 },
      ],
    },
    {
      label: "10×",
      figure: "$1,910",
      x: 130,
      total: 110,
      parts: [
        { h: 36, opacity: 1 },
        { h: 26, opacity: 0.7 },
        { h: 28, opacity: 0.5 },
        { h: 20, opacity: 0.3 },
      ],
    },
    {
      label: "100×",
      figure: "$22,400",
      x: 230,
      total: 170,
      parts: [
        { h: 70, opacity: 1 },
        { h: 36, opacity: 0.7 },
        { h: 38, opacity: 0.5 },
        { h: 26, opacity: 0.3 },
      ],
    },
  ];
  const baseY = 200;
  return (
    <svg
      viewBox="0 0 320 220"
      className={className}
      role="img"
      aria-label="Cost ladder: launch, ten-times scale, and hundred-times scale, with stacked component breakdowns."
      fill="none"
    >
      {/* Baseline */}
      <line
        x1="14"
        y1={baseY}
        x2="306"
        y2={baseY}
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1"
      />

      {bars.map((b) => {
        let cursorY = baseY;
        return (
          <g key={b.label}>
            {b.parts.map((p, i) => {
              cursorY -= p.h;
              return (
                <rect
                  key={i}
                  x={b.x}
                  y={cursorY}
                  width="60"
                  height={p.h - 1.5}
                  rx="2"
                  fill="rgb(var(--md-sys-color-primary))"
                  opacity={p.opacity}
                />
              );
            })}
            <text
              x={b.x + 30}
              y={baseY + 14}
              fontSize="9"
              fill="currentColor"
              opacity="0.7"
              fontFamily="inherit"
              textAnchor="middle"
            >
              {b.label}
            </text>
            <text
              x={b.x + 30}
              y={baseY - b.total - 8}
              fontSize="11"
              fill="currentColor"
              fontFamily="inherit"
              textAnchor="middle"
              fontWeight="600"
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {b.figure}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform="translate(14, 18)">
        {[
          { label: "compute", opacity: 1 },
          { label: "database", opacity: 0.7 },
          { label: "network", opacity: 0.5 },
          { label: "llm + research", opacity: 0.3 },
        ].map((l, i) => (
          <g key={l.label} transform={`translate(${i * 75}, 0)`}>
            <rect
              width="10"
              height="6"
              rx="1.5"
              fill="rgb(var(--md-sys-color-primary))"
              opacity={l.opacity}
            />
            <text
              x="14"
              y="6"
              fontSize="8"
              fill="currentColor"
              opacity="0.6"
              fontFamily="inherit"
            >
              {l.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
