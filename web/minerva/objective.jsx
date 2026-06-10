/* Minerva — Screen 1: Home / picker.
   Two entry modes — Discovery ("Find the move") and Validation ("Validate a task").
   Both end in the same promise: an evidence-backed, data-driven decision.
   Presentation switches via the `layout` prop — "lanes" (side-by-side) or "tabs"
   (one full-width mode at a time). The app passes "tabs". */
const { useState: useStateObj } = React;

const VALIDATION_CHIPS = [
  "Add an index to orders.email",
  "Cache the product catalog",
  "Split the checkout service",
];
const SCOPE_SERVICES = ["all services", "checkout", "cart", "product-catalog", "payment-gateway"];

/* ---- Lane A · Discovery -------------------------------------------------- */
function DiscoveryPanel({ layout, onDiscovery }) {
  const objectives = window.MinervaData.objectives;
  const [custom, setCustom] = useStateObj("");
  return (
    <section className={"lane lane-discovery" + (layout === "tabs" ? " is-tab" : "")}>
      {layout === "lanes" && (
        <div className="lane-head">
          <div className="lane-tag"><span className="ltr">A</span> Discovery</div>
          <h2>Find the move</h2>
          <p>Set an objective. Minerva interrogates your Dynatrace data and ranks where the leverage actually is.</p>
        </div>
      )}

      <div className="obj-grid">
        {objectives.map((o) => {
          const locked = !!o.roadmap;
          return (
            <button
              key={o.id}
              className={"obj-card" + (o.active ? " is-primary" : "") + (locked ? " is-roadmap" : "")}
              onClick={() => !locked && onDiscovery(o)}
              disabled={locked}
              aria-disabled={locked}
            >
              {o.active && <span className="ribbon">Live · MVP</span>}
              {locked && <span className="ribbon roadmap-ribbon">Roadmap</span>}
              <span className="ico-wrap"><Icon name={o.icon} className="ico" /></span>
              <h3>{o.title}</h3>
              <p>{o.blurb}</p>
              <span className="foot">
                <span className="metric-tag">{o.metric}</span>
                {!locked && <Icon name="arrowRight" className="go" size={18} />}
              </span>
            </button>
          );
        })}
      </div>

      <form
        className="obj-custom"
        onSubmit={(e) => {
          e.preventDefault();
          const text = custom.trim();
          onDiscovery({ id: "custom", title: text || "Improve Performance", custom: !!text });
        }}
      >
        <Icon name="compass" className="ico" />
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="…or set your own objective — “make checkout feel instant on mobile”"
        />
        <button type="submit" className="btn btn-sm">
          Investigate <Icon name="arrowRight" className="ico" size={16} />
        </button>
      </form>
    </section>
  );
}

/* ---- Lane B · Validation ------------------------------------------------- */
function ValidationPanel({ layout, onValidate }) {
  const [task, setTask] = useStateObj("");
  const [scope, setScope] = useStateObj("all services");
  const submit = () => {
    const t = task.trim();
    if (!t) return;
    onValidate({ task: t, scope });
  };
  return (
    <section className={"lane lane-validation" + (layout === "tabs" ? " is-tab" : "")}>
      {layout === "lanes" && (
        <div className="lane-head">
          <div className="lane-tag accent"><span className="ltr">B</span> Validation</div>
          <h2>Validate a task</h2>
          <p>Describe a task or hypothesis — Minerva pulls the data to <b>confirm, quantify, or refute</b> it.</p>
        </div>
      )}

      <form className="validate-box" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <span className="vb-label eyebrow"><span className="lead">▸</span>THE CLAIM TO TEST</span>
        <textarea
          className="vb-input"
          value={task}
          rows={3}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. “Adding an index on orders.email will make checkout faster.”"
        />

        <div className="vb-chips">
          <span className="lbl">Try one</span>
          <div className="chips">
            {VALIDATION_CHIPS.map((c) => (
              <button
                type="button"
                key={c}
                className={"chip" + (task.trim() === c ? " is-on" : "")}
                onClick={() => setTask(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="vb-foot">
          <label className="scope-select">
            <span className="k">Scope</span>
            <span className="sel">
              <Icon name="layers" size={14} className="ico" />
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                {SCOPE_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </span>
            <span className="opt">optional</span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={!task.trim()}>
            Validate with data <Icon name="arrowRight" className="ico" size={16} />
          </button>
        </div>
      </form>

      <div className="vb-note">
        <Icon name="target" className="ico" size={15} />
        <span>Minerva decides what would <b>confirm</b> or <b>refute</b> the claim, runs the queries, and returns a single verdict — not a to-do list.</span>
      </div>
    </section>
  );
}

/* ---- the screen ---------------------------------------------------------- */
function ObjectivePicker({ layout, onDiscovery, onValidate }) {
  const mode = layout || "tabs";
  const [tab, setTab] = useStateObj("discovery");

  return (
    <div className="screen">
      <div className="container">
        <div className="obj-hero">
          <OwlMark className="owl-lg" size={60} />
          <div className="eyebrow" style={{ marginBottom: "1rem" }}>
            <span className="lead">—</span>DATA-DRIVEN OPTIMISATION AGENT
          </div>
          <h1>Minerva</h1>
          <p className="tagline">
            You bring the goal — or the hunch. Minerva returns the <em>wisest move</em>, decided by your Dynatrace data — never opinion.
          </p>
          <div className="promise-strip">
            <span className="k">Two ways in</span>
            <span className="d">·</span>
            <span className="t">both end in a <b>data-driven decision</b>, populated with Dynatrace evidence</span>
          </div>
        </div>

        {mode === "tabs" ? (
          <div className="home-tabs">
            <div className="tabbar" role="tablist" aria-label="Choose a mode">
              <button
                className={"tab" + (tab === "discovery" ? " is-on" : "")}
                role="tab" aria-selected={tab === "discovery"}
                onClick={() => setTab("discovery")}
              >
                <span className="ltr">A</span>
                <span className="tx"><b>Find the move</b><em>Discovery — set an objective</em></span>
              </button>
              <button
                className={"tab accent" + (tab === "validation" ? " is-on" : "")}
                role="tab" aria-selected={tab === "validation"}
                onClick={() => setTab("validation")}
              >
                <span className="ltr">B</span>
                <span className="tx"><b>Validate a task</b><em>Validation — test a claim</em></span>
              </button>
            </div>
            <div className="tab-panel">
              {tab === "discovery"
                ? <DiscoveryPanel layout="tabs" onDiscovery={onDiscovery} />
                : <ValidationPanel layout="tabs" onValidate={onValidate} />}
            </div>
          </div>
        ) : (
          <div className="lanes">
            <DiscoveryPanel layout="lanes" onDiscovery={onDiscovery} />
            <ValidationPanel layout="lanes" onValidate={onValidate} />
          </div>
        )}
      </div>
    </div>
  );
}

window.ObjectivePicker = ObjectivePicker;
