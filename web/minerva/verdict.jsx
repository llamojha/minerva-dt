/* Minerva — Screen 4b: VALIDATION VERDICT
   Not a board — a single, decisive verdict. Reuses the opportunity-card DNA but
   leads with a STANCE. Refuted carries the "what actually matters" redirect that
   hands the user back into Discovery.

   The verdict arrives live: a validate-task run emits a `verdict.ready` event, which app.jsx
   adapts (MinervaTransport.adaptVerdict) and passes as the `verdict` prop. When that prop is
   absent (offline / fixture preview) we fall back to the mock keyed by task text
   (window.MinervaData.validations) with a stance switcher — keeping the demo working offline. */
const { useState: useStateVerdict } = React;

const VERDICT_META = {
  confirmed:    { label: "Confirmed",    tone: "confirmed" },
  refuted:      { label: "Refuted",      tone: "refuted" },
  inconclusive: { label: "Inconclusive", tone: "inconclusive" },
};

/* the stance glyph — ✓ gold, ✗ red, ◐ half */
function VerdictGlyph({ tone, size }) {
  const s = size || 30;
  if (tone === "confirmed")
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
  if (tone === "refuted")
    return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
  // inconclusive — half-filled disc
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function VerdictBadge({ tone }) {
  const m = VERDICT_META[tone];
  return (
    <div className={"verdict-badge vb-" + tone}>
      <span className="g"><VerdictGlyph tone={tone} size={26} /></span>
      <span className="lab">{m.label}</span>
    </div>
  );
}

/* a "not projectable" panel for Inconclusive (stands in for the before→after) */
function NotProjectable({ note }) {
  return (
    <div className="not-projectable">
      <div className="np-head"><Icon name="activity" size={15} className="ico" /><span>Impact — can't be projected</span></div>
      <p>{note}</p>
    </div>
  );
}

function ValidationVerdict({ task, verdict, onBack, onOpenQuery, onAction, onRunDiscovery, onJumpToOpp }) {
  const D = window.MinervaData;
  // LIVE: render the adapted verdict from the backend. OFFLINE / fixture-preview: fall back to the
  // mock keyed by task text, with a state switcher to preview each stance.
  const live = !!verdict;
  const initial = verdict || D.validationForTask(task) || D.validations.refuted;
  const [vkey, setVkey] = useStateVerdict(initial.key);
  const v = live ? verdict : D.validationByKey(vkey);

  // Each evidence row resolves to a drawer query view-model. Live evidence carries a prebuilt
  // `query` ({label, dql, result, deepLink}); mock evidence carries a `queryId` → D.queryById.
  const evQuery = (e) => {
    if (e.query) return e.query;
    const q = D.queryById(e.queryId);
    return q ? { label: q.queryLabel, dql: q.query, result: q.result, timing: q.timing } : null;
  };
  const openQ = (e) => {
    const q = evQuery(e);
    if (q) onOpenQuery(q);
  };
  // Per-evidence query blocks (the inline DQL preview). Keep the same shape for both paths.
  const queryBlocks = v.evidence
    .map((e) => ({ ev: e, q: evQuery(e) }))
    .filter((x) => x.q);

  // synthetic opp so the shared export/ticket modal works unchanged
  const asOpp = { id: live && v.id ? v.id : "v-" + v.key, rank: 1, service: v.service, endpoint: v.endpoint };

  return (
    <div className="screen">
      <div className="container detail">
        <div className="verdict-topline">
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ paddingLeft: 4 }}>
            <Icon name="arrowLeft" className="ico" size={16} /> Back
          </button>
          {/* reviewer state switcher — offline/fixture only; the live verdict shows its real stance */}
          {!live && (
            <div className="verdict-switch" role="tablist" aria-label="Preview verdict state">
              <span className="sw-label">Preview state</span>
              {Object.keys(VERDICT_META).map((k) => (
                <button
                  key={k}
                  className={"sw" + (k === vkey ? " is-on sw-" + k : "")}
                  onClick={() => setVkey(k)}
                  role="tab"
                  aria-selected={k === vkey}
                >
                  {VERDICT_META[k].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="eyebrow" style={{ marginBottom: "0.85rem" }}>
          <span className="lead">—</span>VALIDATION VERDICT · 004
        </div>

        {/* THE VERDICT CARD */}
        <div className={"card verdict-card vc-" + v.verdict}>
          {/* stance header */}
          <div className="verdict-hero">
            <VerdictBadge tone={v.verdict} />
            <div className="vh-text">
              <div className="stance">{v.stance}</div>
              <div className="claim">
                <span className="ck">Claim tested</span>
                <p>"{v.claim}"</p>
              </div>
            </div>
            <div className="vh-svc">
              <span className="k">scope</span>
              <span className="svc">{v.service} · {v.endpoint}</span>
            </div>
          </div>

          {/* body grid */}
          <div className="verdict-grid">
            {/* left: quantified impact */}
            <div className="vg-col">
              <div className="vg-block impact-block">
                <span className="vg-label eyebrow"><span className="lead">▸</span>QUANTIFIED IMPACT</span>
                {v.metric ? (
                  <React.Fragment>
                    <BeforeAfterBars metric={v.metric} />
                    {v.whySmall && (
                      <div className="why-small">
                        <Icon name="alert" size={14} className="ico" />
                        <span>{v.whySmall}</span>
                      </div>
                    )}
                  </React.Fragment>
                ) : (
                  <NotProjectable note={v.assumptions} />
                )}
              </div>

              <div className="vg-block">
                <span className="vg-label eyebrow"><span className="lead">▸</span>CONFIDENCE</span>
                <div className="conf-row">
                  <ConfidenceBadge level={v.confidence} />
                  <span className="conf-note">{v.confidenceNote}</span>
                </div>
              </div>

              <div className="vg-block dissent-block">
                <span className="vg-label eyebrow" style={{ color: "var(--danger)" }}>
                  <span className="lead" style={{ color: "var(--danger)" }}>▸</span>DISSENT — CONTRARY SIGNAL
                </span>
                <p className="dissent-text">{v.dissent}</p>
              </div>
            </div>

            {/* right: evidence */}
            <div className="vg-col">
              <div className="vg-block evidence-block">
                <span className="vg-label eyebrow"><span className="lead">▸</span>EVIDENCE — THE QUERIES BEHIND THE VERDICT</span>
                <div className="ev-chips">
                  {v.evidence.map((e, i) => (
                    <DqlChip key={i} label={e.label} onClick={() => openQ(e)} />
                  ))}
                </div>
                {queryBlocks.map(({ ev, q }, i) => (
                  <div className="query-block" key={ev.id || i}>
                    <div className="qb-head">
                      <span className="name">{q.label}</span>
                      <DqlChip label="open" onClick={() => openQ(ev)} />
                    </div>
                    <pre>{q.dql}</pre>
                    <div className="qb-result"><span className="arrow">→</span><span className="r">{q.result}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* THE KEY MOMENT — redirect / next step */}
          {v.redirect && (
            <div className={"redirect " + (v.verdict === "refuted" ? "redirect-refuted" : "redirect-soft")}>
              <div className="rd-mark"><Icon name="compass" size={20} /></div>
              <div className="rd-body">
                <span className="rd-eyebrow">
                  {v.verdict === "refuted" ? "What actually matters" : "The measurable win, meanwhile"}
                </span>
                <p className="rd-finding">{v.redirect.finding}</p>
                <span className="rd-delta">{v.redirect.deltaLine}</span>
              </div>
              <div className="rd-actions">
                <button className="btn btn-primary btn-sm" onClick={() => onRunDiscovery(v.redirect.objectiveId)}>
                  Run Discovery on Performance <Icon name="arrowRight" className="ico" size={15} />
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => onJumpToOpp(v.redirect.oppId)}>
                  See the finding now →
                </button>
              </div>
            </div>
          )}

          {v.verdict === "inconclusive" && v.needToKnow && (
            <div className="to-know">
              <Icon name="sliders" size={16} className="ico" />
              <div>
                <span className="lbl">To get an answer</span>
                <p>{v.needToKnow}</p>
              </div>
            </div>
          )}

          {/* ACT */}
          <div className="verdict-act">
            <div className="act-lead">
              <span className="k">Act on this verdict</span>
              <span className="t">Same export as the Opportunity Board — the claim, the verdict and the source DQL travel together.</span>
            </div>
            <div className="act-buttons">
              <button className="btn btn-primary btn-sm" onClick={() => onAction(asOpp, "notebook")}>
                <Icon name="fileText" className="ico" size={15} /> Export to Dynatrace notebook
              </button>
              <button className="btn btn-sm" onClick={() => onAction(asOpp, "ticket")}>
                <Icon name="ticket" className="ico" size={15} /> Open as ticket
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.ValidationVerdict = ValidationVerdict;
