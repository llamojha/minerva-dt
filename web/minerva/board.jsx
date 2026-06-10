/* Minerva — Screen 3: Opportunity Board */
const { useState: useStateBoard } = React;

/* ---- one opportunity card ---------------------------------------------- */
function OppCard({ opp, onOpenQuery, onOpenDetail, onAction }) {
  return (
    <div className={"card opp-card lev-" + opp.leverage + "-card"} id={"opp-" + opp.id}>
      <div className="opp-top">
        <span className="opp-rank">{opp.rank}</span>
        <div className="opp-headline">
          <div className="row1">
            <LeveragePill level={opp.leverage} />
            <span className="svc">{opp.service} · {opp.endpoint}</span>
          </div>
          <p className="finding">{opp.finding}</p>
        </div>
      </div>

      <div className="opp-body">
        <div className="opp-meta">
          <div className="badge-row">
            <EffortBadge level={opp.effort} />
            <ConfidenceBadge level={opp.confidence} />
          </div>

          <div className="dissent">
            <Icon name="alert" className="ico" />
            <div>
              <span className="label">Dissent</span>
              {opp.dissent}
            </div>
          </div>

          <div className="evidence">
            <span className="lbl">Evidence</span>
            <div className="chips">
              {opp.evidence.map((e, i) =>
                e.query ? (
                  <DqlChip key={i} label={e.label} onClick={() => onOpenQuery(e.query)} />
                ) : (
                  <span key={i} className="dql-chip is-static" title={e.resultSummary}>
                    {e.label} <span className="arrow">{e.source}</span>
                  </span>
                )
              )}
            </div>
          </div>

          <div className="rec-action">
            <Icon name="lightbulb" className="ico" />
            <div>
              <span className="label">Recommended</span>
              <span className="txt">{opp.action}</span>
            </div>
          </div>
        </div>

        <div>
          <BeforeAfterBars metric={opp.metric} />
        </div>
      </div>

      <div className="opp-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onAction(opp, "notebook")}>
          <Icon name="fileText" className="ico" size={15} /> Export to Dynatrace notebook
        </button>
        <button className="btn btn-sm" onClick={() => onAction(opp, "ticket")}>
          <Icon name="ticket" className="ico" size={15} /> Open as ticket
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onOpenDetail(opp.id)} style={{ marginLeft: "auto" }}>
          View full evidence <Icon name="arrowRight" className="ico" size={15} />
        </button>
      </div>
    </div>
  );
}

function OpportunityBoard({ opportunities, onOpenQuery, onOpenDetail, onAction }) {
  const opps = opportunities || [];
  return (
    <div className="screen">
      <div className="container board">
        <div className="board-head">
          <div>
            <div className="eyebrow"><span className="lead">—</span>OPPORTUNITY BOARD · 003</div>
            <h2>The wisest moves, ranked by your data</h2>
          </div>
          <div className="sort">
            <Icon name="sliders" size={15} /> sorted by <b>impact × effort</b>, measured from Dynatrace data
          </div>
        </div>

        <div className="board-grid">
          <div className="opp-list">
            {opps.map((o) => (
              <OppCard
                key={o.id}
                opp={o}
                onOpenQuery={onOpenQuery}
                onOpenDetail={onOpenDetail}
                onAction={onAction}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.OpportunityBoard = OpportunityBoard;
