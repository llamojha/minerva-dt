/* Minerva — shared UI primitives. Exports to window for cross-script use. */
const { useState, useEffect, useRef } = React;

/* ----------------------------------------------------- thin-line icon set */
const ICON_PATHS = {
  gauge: '<path d="M12 14l4-4"/><path d="M3.5 16a9 9 0 1 1 17 0"/><circle cx="12" cy="14" r="1.4"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1"/><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M16 12.5h2"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8l12 8M8 16L20 8"/>',
  trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  rocket: '<path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5"/><path d="M9 15l-3-3a13 13 0 0 1 9-9c2 0 3 1 3 3a13 13 0 0 1-9 9z"/><circle cx="14.5" cy="9.5" r="1.4"/>',
  arrowRight: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  fileText: '<path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M9 13h6M9 17h4"/>',
  ticket: '<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="2 2"/>',
  zap: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
  alert: '<path d="M12 4L3 19h18z"/><path d="M12 10v4M12 17h.01"/>',
  lightbulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  star: '<path d="M12 3l2.6 5.5 6 .8-4.3 4.2 1 6L12 16.8 6.7 19.5l1-6L3.4 9.3l6-.8z"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  terminal: '<path d="M6 9l3 3-3 3M13 15h5"/><rect x="3" y="4" width="18" height="16" rx="2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>',
  branch: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M6 12h6a3 3 0 0 0 3-3V10.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};

function Icon({ name, className, size }) {
  const s = size || 20;
  return (
    <svg className={className} width={s} height={s} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || "" }} />
  );
}

/* --------------------------------------------------- Minerva owl brand mark
   A geometric owl monogram: a wisdom-disc framing two owl eyes with gold
   irises and a small beak. Line-drawn, currentColor + gold accents. */
function OwlMark({ size, className }) {
  const s = size || 32;
  return (
    <svg className={className} width={s} height={s} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
      {/* facial disc / brow */}
      <path d="M13 20c0-6 5-10 11-10s11 4 11 10" stroke="var(--gold-500)" strokeWidth="1.6"
            strokeLinecap="round" fill="none" />
      {/* ear tufts */}
      <path d="M15 13l3 3M33 13l-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      {/* eyes */}
      <circle cx="18.5" cy="23" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="29.5" cy="23" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18.5" cy="23" r="2" fill="var(--gold-500)" />
      <circle cx="29.5" cy="23" r="2" fill="var(--gold-500)" />
      {/* beak */}
      <path d="M24 25.5l-2 3h4z" fill="var(--gold-500)" opacity="0.9" />
      {/* breast feather hint */}
      <path d="M19 33c1.5 1.5 3.2 2.2 5 2.2s3.5-.7 5-2.2" stroke="currentColor" strokeWidth="1.3"
            strokeLinecap="round" opacity="0.5" fill="none" />
    </svg>
  );
}

/* ---------------------------------------------------------------- badges */
function EffortBadge({ level }) {
  return (
    <span className={"badge eff-" + level}>
      <span className="k">EFFORT</span>
      <span className="bar"><i></i><i></i><i></i></span>
      {level}
    </span>
  );
}
function ConfidenceBadge({ level }) {
  return (
    <span className={"badge conf-" + level}>
      <span className="k">CONF</span>
      <span className="conf-dot"></span>
      {level}
    </span>
  );
}
function LeveragePill({ level }) {
  if (level === "high")
    return <span className="lev-pill lev-high"><Icon name="star" size={12} /> High leverage</span>;
  return <span className="lev-pill lev-low">Lower leverage</span>;
}

/* DQL chip — opens the query drawer */
function DqlChip({ label, onClick }) {
  return (
    <button className="dql-chip" onClick={onClick}>
      {label} <span className="arrow">DQL ↗</span>
    </button>
  );
}

/* ------------------------------------------------ before → after bar chart
   Bars are filled in their base state (robust when the compositor clock is
   frozen). The grow-from-zero is layered on only under html.anim-on. */
function BeforeAfterBars({ metric }) {
  const max = Math.max(metric.before, metric.after);
  const bw = (metric.before / max) * 100;
  const aw = (metric.after / max) * 100;
  const dirClass = metric.deltaPct < 0 ? "down" : "up";
  const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
  return (
    <div className="ba-chart">
      <div className="ba-head">
        <span className="metric-name">{metric.label}</span>
        <span className={"delta " + dirClass}>
          {metric.deltaPct > 0 ? "+" : ""}{metric.deltaPct}% {metric.better === "down" ? "faster" : "more"}
        </span>
      </div>
      <div className="ba-row">
        <span className="k">Now</span>
        <div className="ba-track"><div className="ba-fill before" style={{ width: bw + "%" }}></div></div>
        <span className="v">{fmt(metric.before)}{metric.unit}</span>
      </div>
      <div className="ba-row">
        <span className="k">Proj.</span>
        <div className="ba-track"><div className="ba-fill after" style={{ width: aw + "%", animationDelay: "0.14s" }}></div></div>
        <span className="v">{fmt(metric.after)}{metric.unit}</span>
      </div>
    </div>
  );
}

/* hook: fire once element scrolls into view */
function useInView(options) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setSeen(true); obs.disconnect(); } });
    }, options || { threshold: 0.35 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [seen]);
  return [ref, seen];
}

/* very light DQL syntax highlight for the drawer */
function highlightDql(src) {
  const kw = ["timeseries", "fetch", "filter", "summarize", "sort", "limit", "fields", "by", "and", "or", "isNotNull", "contains", "desc", "asc"];
  let html = src
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/"([^"]*)"/g, '<span class="dql-str">"$1"</span>');
  html = html.replace(/\b(percentile|count|avg|max|min)\b/g, '<span class="dql-fn">$1</span>');
  kw.forEach((k) => {
    html = html.replace(new RegExp("\\b" + k + "\\b", "g"), '<span class="dql-kw">' + k + "</span>");
  });
  return html;
}

Object.assign(window, {
  Icon, OwlMark, EffortBadge, ConfidenceBadge, LeveragePill,
  DqlChip, BeforeAfterBars, useInView, highlightDql,
});
