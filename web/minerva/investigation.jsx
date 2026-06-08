/* Minerva — Screen 2: Investigation Stream.
   Renders the live SSE run: the plan and each step's status/result arrive as AgentEvents (the
   reducer in app.jsx accumulates them), so the "agent thinking" animation is driven by real
   event arrival rather than a local timer. The objectives rail stays static config. */

function InvestigationStream({ objective, mode, task, steps, progress, planArrived, done, error, oppCount, onOpenQuery, onComplete }) {
  const objectiveRail = window.MinervaData.objectiveRail;
  const isValidation = mode === "validation";
  const N = steps.length || 4; // expected plan size for the progress bar before plan arrives
  const pct = done ? 100 : Math.round((progress / N) * 100);

  return (
    <div className="screen">
      <div className="container">
        <div className="invest">
          {/* main stream */}
          <div>
            <div className="invest-head">
              <div className="eyebrow"><span className="lead">—</span>{isValidation ? "VALIDATION · LIVE" : "INVESTIGATION · LIVE"}</div>
              <h2>{error
                ? (isValidation ? "Validation interrupted" : "Investigation interrupted")
                : done
                  ? (isValidation ? "Verdict ready" : "Investigation complete")
                  : (isValidation ? "Minerva is testing the claim" : "Minerva is investigating")}</h2>
              <div className="sub">
                {isValidation ? (
                  <span className="validating-of">Validating:&nbsp;<b style={{ color: "var(--text-accent)", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>“{task}”</b></span>
                ) : (
                  <span>Objective:&nbsp;<b style={{ color: "var(--text-accent)", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>{objective.title}</b></span>
                )}
                <span className="scope">· scope: {(objective && objective.scope) || "all services"} · last 2h</span>
              </div>
            </div>

            {error && (
              <div className="invest-done-bar" style={{ borderColor: "var(--danger)" }}>
                <div className="summary">
                  <div className="big">Could not reach the agent.</div>
                  <div className="small">{error} — is the transport running? (<code>npm run dev</code>)</div>
                </div>
              </div>
            )}

            <div className="progress-meter">
              <Icon name="activity" size={16} style={{ color: "var(--text-muted)" }} />
              <div className="track"><div className="fill" style={{ width: pct + "%" }}></div></div>
              <span className="pct">{pct}%</span>
            </div>

            <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>
              <span className="lead">▸</span>PLAN{planArrived ? " — " + steps.length + " STEPS" : " — PROPOSING…"}
            </div>

            <div className="plan-list">
              {!planArrived && (
                <div className="plan-step running">
                  <div className="status"><span className="ring"><span className="spin"></span></span></div>
                  <div className="body"><div className="pending-label">Minerva is drafting the investigation plan…</div></div>
                  <div className="timing">—</div>
                </div>
              )}
              {steps.map((step) => (
                <div className={"plan-step " + step.status} key={step.id}>
                  <div className="status">
                    <span className="ring">
                      {step.status === "done" && <Icon name="check" size={13} />}
                      {step.status === "running" && <span className="spin"></span>}
                      {step.status === "pending" && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }}></span>}
                    </span>
                  </div>
                  <div className="body">
                    <div className="title">
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-faint)", marginRight: 8 }}>{String(step.index + 1).padStart(2, "0")}</span>
                      {step.title}
                    </div>
                    {step.status === "done" && (
                      <div className="result">
                        <Icon name="chevronRight" size={13} style={{ color: "var(--success)" }} />
                        <span className="text" dangerouslySetInnerHTML={{ __html: emphasize(step.result) }} />
                        <DqlChip label={step.queryLabel} onClick={() => onOpenQuery(step.query)} />
                      </div>
                    )}
                    {step.status === "running" && (
                      <div className="pending-label">executing <span style={{ color: "var(--teal-300)" }}>{step.queryLabel}</span> …</div>
                    )}
                    {step.status === "pending" && <div className="pending-label">queued</div>}
                  </div>
                  <div className="timing">{step.status === "done" ? step.timing : step.status === "running" ? "running" : "—"}</div>
                </div>
              ))}
            </div>

            {done && !error && (
              <div className="invest-done-bar">
                <div className="summary">
                  {isValidation ? (
                    <React.Fragment>
                      <div className="big">The data has an <b>answer</b>.</div>
                      <div className="small">Minerva tested what would confirm or refute the claim — here's the verdict.</div>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <div className="big">Found <b>{oppCount} high-leverage</b> {oppCount === 1 ? "opportunity" : "opportunities"}.</div>
                      <div className="small">Ranked by impact × effort, each backed by the queries above.</div>
                    </React.Fragment>
                  )}
                </div>
                <button className="btn btn-primary" onClick={onComplete}>
                  {isValidation ? "See the verdict" : "View Opportunity Board"} <Icon name="arrowRight" className="ico" size={16} />
                </button>
              </div>
            )}
          </div>

          {/* objectives rail */}
          <aside className="specialists">
            <div className="rail-label eyebrow"><span className="lead">—</span>OBJECTIVES</div>
            <div className="strategist">
              <OwlMark className="mark" size={38} />
              <div className="meta">
                <div className="n">Minerva</div>
                <div className="r">Optimization agent · investigating</div>
              </div>
            </div>
            <div className="dispatch-line">
              <span className="l"></span>
              <span className="txt">{done ? "ranked the board" : "investigating…"}</span>
            </div>

            {objectiveRail.map((o) => {
              const isActive = o.state === "active";
              const cls = isActive ? (done ? "reported" : "active") : "";
              return (
                <div className={"spec-card " + cls} key={o.id}>
                  <span className="avatar"><Icon name={specIcon(o.id)} className="ico" /></span>
                  <div className="meta">
                    <div className="n">{o.name}</div>
                    <div className="r">{o.role}</div>
                  </div>
                  <span className="state">
                    <span className="d"></span>
                    {isActive ? (done ? "done" : "active") : "roadmap"}
                  </span>
                </div>
              );
            })}
          </aside>
        </div>
      </div>
    </div>
  );
}

function specIcon(id) {
  return { perf: "gauge", cost: "wallet", errors: "shield", scale: "trending" }[id] || "target";
}
// bold the salient quantitative phrase of a result line (percentages, "no index…", etc.)
function emphasize(text) {
  const safe = (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return safe.replace(/(\d+%[^,.]*|no index[^,.]*|pre-existing)/i, "<b>$1</b>");
}

window.InvestigationStream = InvestigationStream;
