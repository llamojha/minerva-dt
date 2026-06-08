/* Minerva — Screen 4: Opportunity Detail (full evidence + actions) */
function OpportunityDetail({ opp, onBack, onOpenQuery, onAction, createdArtifact }) {
  if (!opp) return null;
  const m = opp.metric;
  const dir = m.deltaPct < 0 ? "down" : "up";
  const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
  const evidence = opp.evidence || [];

  return (
    <div className="screen">
      <div className="container detail">
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: "1.25rem", paddingLeft: 4 }}>
          <Icon name="arrowLeft" className="ico" size={16} /> Back to board
        </button>

        <div className="detail-head">
          <div className="row1">
            <LeveragePill level={opp.leverage} />
            <span className="badge"><span className="k">#{opp.rank}</span> {opp.service} · {opp.endpoint}</span>
          </div>
          <h2>{opp.finding}</h2>
        </div>

        <div className="detail-grid">
          {/* left column */}
          <div className="detail-side">
            <div className="card hero-metric">
              <span className="label">Projected impact — {m.label}</span>
              <div className="hero-nums">
                <div className="col before">
                  <span className="cap">Now</span>
                  <span className="big">{fmt(m.before)}<span style={{ fontSize: "0.4em", color: "var(--text-faint)" }}>{m.unit}</span></span>
                </div>
                <Icon name="arrowRight" className="arrow" size={28} />
                <div className="col after">
                  <span className="cap">Projected</span>
                  <span className="big">{fmt(m.after)}<span style={{ fontSize: "0.4em", color: "var(--text-faint)" }}>{m.unit}</span></span>
                </div>
              </div>
              <span className={"hero-delta " + dir}>
                <Icon name={dir === "down" ? "trending" : "trending"} size={16} />
                {m.deltaPct > 0 ? "+" : ""}{m.deltaPct}% {m.better === "down" ? "faster" : "more throughput"}
              </span>
            </div>

            <div className="card action-deck">
              {createdArtifact ? (
                <ActionSuccess artifact={createdArtifact} />
              ) : (
                <React.Fragment>
                  <div className="recommend">
                    <Icon name="lightbulb" className="ico" />
                    <div>
                      <span className="label">Recommended action</span>
                      <div className="txt">{opp.action}</div>
                    </div>
                  </div>
                  {opp.actionDetail && <div className="action-code"><pre>{opp.actionDetail}</pre></div>}
                  <div className="action-buttons">
                    <button className="btn btn-primary btn-sm" onClick={() => onAction(opp, "notebook")}>
                      <Icon name="fileText" className="ico" size={15} /> Export to Dynatrace notebook
                    </button>
                    <button className="btn btn-sm" onClick={() => onAction(opp, "ticket")}>
                      <Icon name="ticket" className="ico" size={15} /> Open as ticket
                    </button>
                  </div>
                </React.Fragment>
              )}
            </div>
          </div>

          {/* right column — evidence */}
          <div className="detail-side">
            <div className="card detail-block">
              <div className="bh"><Icon name="terminal" className="ico" /><span className="t">Source queries · evidence</span></div>
              {evidence.map((e) => (
                <div className="query-block" key={e.id}>
                  <div className="qb-head">
                    <span className="name">{e.label} <span className="ev-source">{e.source}</span></span>
                    {e.query && <DqlChip label="open" onClick={() => onOpenQuery(e.query)} />}
                  </div>
                  {e.dql && <pre>{e.dql}</pre>}
                  <div className="qb-result"><span className="arrow">→</span><span className="r">{e.resultSummary}</span></div>
                </div>
              ))}
            </div>

            <div className="card detail-block assume">
              <div className="bh"><Icon name="sliders" className="ico" /><span className="t">Assumptions behind the estimate</span></div>
              <p>{opp.assumptions}</p>
            </div>

            <div className="card detail-block">
              <div className="bh"><Icon name="alert" className="ico" style={{ color: "var(--danger)" }} /><span className="t" style={{ color: "var(--danger)" }}>Dissent — contrary evidence</span></div>
              <p>{opp.dissent}</p>
            </div>

            <div className="card detail-block">
              <div className="bh"><Icon name="target" className="ico" /><span className="t">Confidence — {opp.confidence}</span></div>
              <p>{opp.confidenceNote}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionSuccess({ artifact }) {
  return (
    <div className="action-success">
      <div className="check"><Icon name="check" className="ico" /></div>
      <div>
        <h4>{artifact.type === "ticket" ? "Ticket opened" : "Notebook exported"}</h4>
        <p>
          {artifact.type === "ticket"
            ? "A ticket was created with the finding, evidence queries, and the recommended action attached."
            : "A Dynatrace notebook was created with the before→after projection and the source DQL, ready to share."}
        </p>
      </div>
      <div className="artifact-link">
        <div className="left">
          <Icon name={artifact.type === "ticket" ? "ticket" : "fileText"} className="ico" />
          <span className="nm">{artifact.ref}</span>
        </div>
        <Icon name="external" className="go" />
      </div>
    </div>
  );
}

window.OpportunityDetail = OpportunityDetail;
