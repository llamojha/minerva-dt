/* Minerva — app shell: navigation, top bar, DQL drawer, action modal, footer.
   The dynamic content (plan, opportunities, self-stats) is now driven by the live SSE stream
   via window.MinervaTransport; the objective picker stays static config from data.js. */
const { useState: useS, useEffect: useE, useCallback, useReducer, useRef: useRefApp } = React;

const STEPS = {
  discovery: [
    { id: "objective", label: "Objective" },
    { id: "investigation", label: "Investigate" },
    { id: "board", label: "Board" },
  ],
  validation: [
    { id: "objective", label: "Claim" },
    { id: "investigation", label: "Validate" },
    { id: "verdict", label: "Verdict" },
  ],
};

function TopBar({ screen, mode, objective, task, onHome, onBack }) {
  const steps = STEPS[mode] || STEPS.discovery;
  const idx = { objective: 0, investigation: 1, board: 2, detail: 2, verdict: 2 }[screen];
  const showBack = screen !== "objective";
  const crumbText = mode === "validation" ? task : (objective && objective.title);
  return (
    <header className="topbar">
      <div className="brand" onClick={onHome} title="Restart">
        <OwlMark className="mark" size={30} />
        <span className="name"><b>M</b>inerva</span>
      </div>

      {crumbText && screen !== "objective" && (
        <React.Fragment>
          <span className="sep"></span>
          <div className="crumb">
            <span className={"obj-chip" + (mode === "validation" ? " is-validation" : "")}>
              <span className="dot"></span>{crumbText}
            </span>
          </div>
        </React.Fragment>
      )}

      <span className="spacer"></span>

      <div className="step-trace">
        {steps.map((s, i) => (
          <span key={s.id} className={"t " + (i < idx ? "done" : i === idx ? "now" : "")}>
            {String(i + 1).padStart(2, "0")} {s.label}
          </span>
        ))}
        {screen === "detail" && <span className="t now">04 Detail</span>}
      </div>

      {showBack && (
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginLeft: "0.75rem" }}>
          <Icon name="arrowLeft" className="ico" size={16} /> Back
        </button>
      )}
    </header>
  );
}

function SelfObs({ stats }) {
  const placeholder = !stats;
  const s = stats || { tokens: 0, seconds: 0, queries: 0, scannedGB: 0 };
  const rows = [
    { v: placeholder ? "…" : s.tokens.toLocaleString(), k: "tokens" },
    { v: placeholder ? "…" : s.seconds + "s", k: "wall-clock" },
    { v: placeholder ? "…" : s.queries, k: "DQL queries" },
    { v: placeholder ? "…" : s.scannedGB + " GB", k: "grail scanned" },
  ];
  return (
    <footer className="selfobs">
      <div className="inner">
        <div className="lead">
          <OwlMark className="owl" size={16} />
          <span className="t">Minerva watches itself too</span>
        </div>
        <div className="stats">
          {rows.map((st, i) => (
            <span className="stat" key={i}>
              <span className="v">{st.v}</span><span className="k">{st.k}</span>
              {i < rows.length - 1 && <span className="sep">·</span>}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

/* The drawer renders a query view-model directly (label, dql, result, deepLink) — both evidence
   and plan steps carry their own DQL in the contract, so there is no plan-step lookup. */
function DqlDrawer({ query, onClose }) {
  useE(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!query) return null;
  return (
    <React.Fragment>
      <div className="drawer-overlay" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-label="DQL query">
        <div className="drawer-head">
          <div className="ttl">
            <span className="badge-dql">DQL</span>
            <span className="name">{query.label}</span>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="drawer-body">
          <span className="q-label">Query — Dynatrace Grail</span>
          <pre className="dql" dangerouslySetInnerHTML={{ __html: highlightDql(query.dql) }}></pre>
          <div className="drawer-result">
            <div className="rh">Result{query.timing ? " · " + query.timing : ""}</div>
            <div className="rv"><span className="arrow">→</span>{query.result}</div>
          </div>
          {query.deepLink && (
            <a className="artifact-link" href={query.deepLink} target="_blank" rel="noreferrer"
               style={{ marginTop: "0.75rem", textDecoration: "none" }}>
              <div className="left">
                <Icon name="external" className="ico" />
                <span className="nm">Open in Dynatrace</span>
              </div>
              <Icon name="external" className="go" />
            </a>
          )}
          <div className="q-label" style={{ marginTop: "0.5rem" }}>
            Minerva ran this autonomously as part of the investigation.
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

function ActionModal({ action, onClose }) {
  // Driven by the parent: action.status is "creating" while the export request is in flight,
  // then "done". action.url (when present) is the real Dynatrace notebook link.
  const stage = action.status || "done";
  useE(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isTicket = action.type === "ticket";
  const Link = action.url ? "a" : "div";
  const linkProps = action.url ? { href: action.url, target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <div className="drawer-overlay modal-overlay" onClick={stage === "done" ? onClose : undefined} role="dialog" aria-label="Action">
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
          {stage === "creating" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "1rem 0" }}>
              <div className="ring-spin"></div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {isTicket ? "Opening ticket…" : "Building Dynatrace notebook…"}
              </div>
            </div>
          ) : (
            <div className="action-success" style={{ alignItems: "stretch" }}>
              <div className="check" style={{ alignSelf: "flex-start" }}><Icon name="check" className="ico" /></div>
              <div>
                <h4>{isTicket ? "Ticket opened" : "Notebook exported"}</h4>
                <p style={{ marginTop: 6 }}>
                  {isTicket
                    ? "Populated with the finding, Dynatrace evidence queries and recommended action — the data travels with the task."
                    : "Created with the before→after projection and source DQL — ready to share."}
                </p>
              </div>
              <Link className="artifact-link" {...linkProps}>
                <div className="left">
                  <Icon name={isTicket ? "ticket" : "fileText"} className="ico" />
                  <span className="nm">{action.ref}</span>
                </div>
                <Icon name="external" className="go" />
              </Link>
              {action.simulated && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  Demo mode — live export creates a real notebook when connected to a Dynatrace tenant.
                </div>
              )}
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.25rem" }}>
                <button className="btn btn-sm" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- run store ---- */
const initialRun = {
  phase: "idle",            // idle | investigating | done | error
  planSteps: [],            // [{ id, description }]
  completed: {},            // stepId -> step.completed payload
  runningId: null,
  oppsRaw: [],              // contract opportunities, arrival order
  rankedIds: [],
  verdict: null,            // contract verdict (validate-task runs) — adapted at render time
  selfStats: null,          // { tokens, seconds, queries, scannedGB }
  error: null,
};

function runReducer(state, action) {
  if (action.type === "reset") return initialRun;
  if (action.type !== "event") return state;
  const ev = action.ev;
  switch (ev.type) {
    case "run.started":
      return { ...initialRun, phase: "investigating" };
    case "plan.proposed":
      return { ...state, planSteps: ev.steps };
    case "step.started":
      return { ...state, runningId: ev.stepId };
    case "step.completed":
      return {
        ...state,
        completed: { ...state.completed, [ev.stepId]: ev },
        runningId: state.runningId === ev.stepId ? null : state.runningId,
      };
    case "opportunity.added":
      return { ...state, oppsRaw: [...state.oppsRaw, ev.opportunity] };
    case "board.ready":
      return { ...state, rankedIds: ev.rankedOpportunityIds };
    case "verdict.ready":
      return { ...state, verdict: ev.verdict };
    case "run.completed":
      return {
        ...state,
        phase: "done",
        selfStats: {
          tokens: ev.estCost?.tokens ?? 0,
          seconds: +(ev.totalDurationMs / 1000).toFixed(1),
          queries: ev.queryCount,
          scannedGB: ev.estCost?.grailGbScanned ?? 0,
        },
      };
    case "error":
      return { ...state, phase: "error", error: ev.message };
    default:
      return state;
  }
}

/* ----------------------------------------------------------------- App ---- */
function App() {
  const [screen, setScreen] = useS("objective");
  const [mode, setMode] = useS("discovery");   // discovery | validation
  const [objective, setObjective] = useS(null);
  const [task, setTask] = useS("");
  const [detailId, setDetailId] = useS(null);
  const [drawerQ, setDrawerQ] = useS(null);   // query view-model | null
  const [action, setAction] = useS(null);
  const [artifacts, setArtifacts] = useS({});
  const [runId, setRunId] = useS(null);
  const [pendingBoard, setPendingBoard] = useS(false); // jump to board when the run is ready
  const [run, dispatch] = useReducer(runReducer, initialRun);
  const closeRef = useRefApp(null);

  const go = useCallback((s) => { setScreen(s); window.scrollTo({ top: 0 }); }, []);

  // Start a live run (SSE) for an objective and stream its events into the reducer. Used by both
  // Discovery and Validation — Discovery ends in a ranked board, Validation (kind:"validate-task")
  // emits a verdict.ready event the verdict screen renders.
  const startRun = (o) => {
    dispatch({ type: "reset" });
    setRunId(null);
    if (closeRef.current) closeRef.current();
    MinervaTransport.startRun(o)
      .then(({ runId }) => {
        setRunId(runId);
        closeRef.current = MinervaTransport.streamRun(
          runId,
          (ev) => dispatch({ type: "event", ev }),
          () => dispatch({ type: "event", ev: { type: "error", message: "stream lost" } }),
        );
      })
      .catch((e) => dispatch({ type: "event", ev: { type: "error", message: e.message } }));
  };

  const pickObjective = (o) => {
    setMode("discovery");
    setObjective(o);
    setTask("");
    setPendingBoard(false);
    go("investigation");
    startRun(o);
  };

  const startValidation = ({ task, scope }) => {
    const o = { id: "validation", kind: "validate-task", title: task, statement: task, scope };
    setMode("validation");
    setTask(task);
    setObjective(o);
    setPendingBoard(false);
    go("investigation");
    // Run a real validate-task run; it emits verdict.ready before run.completed.
    startRun(o);
  };

  // Redirect from a verdict back into Discovery.
  const runDiscovery = (objId) => {
    const o = window.MinervaData.objectives.find((x) => x.id === objId) || { id: "perf", title: "Improve Performance" };
    pickObjective(o);
  };
  // "See the finding now" — run Discovery and jump straight to the board when it's ready.
  const jumpToOpp = (_oppId) => {
    const o = window.MinervaData.objectives.find((x) => x.id === "perf") || { id: "perf", title: "Improve Performance" };
    setMode("discovery");
    setObjective(o);
    setTask("");
    setPendingBoard(true);
    go("investigation");
    startRun(o);
  };

  useE(() => () => { if (closeRef.current) closeRef.current(); }, []);

  // Deep-link / demo helper: ?objective=<id> auto-starts that run on load.
  useE(() => {
    const id = new URLSearchParams(location.search).get("objective");
    if (!id) return;
    const o = window.MinervaData.objectives.find((x) => x.id === id);
    if (o) pickObjective(o);
  }, []);

  const openDetail = (id) => { setDetailId(id); go("detail"); };

  const completeInvestigation = () => go(mode === "validation" ? "verdict" : "board");

  const back = () => {
    if (screen === "detail") go("board");
    else if (screen === "board") go("investigation");
    else if (screen === "verdict") go("investigation");
    else if (screen === "investigation") go("objective");
  };
  const home = () => {
    if (closeRef.current) closeRef.current();
    dispatch({ type: "reset" });
    setRunId(null);
    setMode("discovery"); setObjective(null); setTask(""); setDetailId(null);
    setPendingBoard(false);
    go("objective");
  };

  // Derive the screens' view-models from the live run.
  const steps = run.planSteps.map((s, i) => {
    const c = run.completed[s.id];
    const vm = MinervaTransport.adaptStep(s, c, i);
    vm.status = c ? "done" : s.id === run.runningId ? "running" : "pending";
    return vm;
  });
  const progress = steps.filter((s) => s.status === "done").length;
  const boardReady = run.rankedIds.length > 0 || run.phase === "done";
  const validationReady = run.verdict != null || run.phase === "done";
  const investigationDone = mode === "validation" ? validationReady : boardReady;

  const orderedRaw = run.rankedIds.length
    ? run.rankedIds.map((id) => run.oppsRaw.find((o) => o.id === id)).filter(Boolean)
    : run.oppsRaw;
  const opps = orderedRaw.map((o, i) => MinervaTransport.adaptOpportunity(o, i + 1));
  const oppById = (id) => opps.find((o) => o.id === id) || null;

  // Deep-link / demo helper: ?goto=board (or the verdict "see the finding now" redirect) jumps to
  // the board once the run is ready.
  const gotoBoard = new URLSearchParams(location.search).get("goto") === "board";
  useE(() => {
    if ((gotoBoard || pendingBoard) && boardReady && screen === "investigation") {
      setPendingBoard(false);
      go("board");
    }
  }, [gotoBoard, pendingBoard, boardReady, screen]);

  // Settle the open modal + remember the artifact for the opportunity.
  const finishAction = (opp, type, ref, opts = {}) => {
    setArtifacts((a) => ({ ...a, [opp.id]: { type, ref } }));
    setAction((a) => (a ? { ...a, ref, url: opts.url || null, status: "done", simulated: !!opts.simulated } : a));
  };

  const runAction = (opp, type) => {
    const simulatedRef =
      type === "ticket"
        ? "OPS-" + (4800 + opp.rank * 7)
        : "minerva/" + opp.service + (opp.endpoint || "").replace(/[^a-z]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") + ".notebook";
    setAction({ opp, type, status: "creating", key: opp.id + type + Date.now() });

    // Real notebook export when we have a live run; ticket export stays simulated (out of MVP).
    if (type === "notebook" && runId) {
      MinervaTransport.exportOpportunity(runId, opp.id)
        .then(({ url }) => finishAction(opp, type, url, { url }))
        // Fixture mode / no tenant: fall back to a simulated artifact so the demo completes.
        .catch(() => finishAction(opp, type, simulatedRef, { simulated: true }));
      return;
    }
    setTimeout(() => finishAction(opp, type, simulatedRef, { simulated: true }), 1000);
  };

  const showFooter = screen !== "objective";

  return (
    <div className="app">
      <TopBar screen={screen} mode={mode} objective={objective} task={task} onHome={home} onBack={back} />

      <main style={{ flex: 1 }}>
        {screen === "objective" && (
          <ObjectivePicker key="obj" layout="tabs" onDiscovery={pickObjective} onValidate={startValidation} />
        )}
        {screen === "investigation" && (
          <InvestigationStream key={"inv-" + mode} objective={objective} mode={mode} task={task}
            steps={steps} progress={progress}
            planArrived={run.planSteps.length > 0} done={investigationDone} error={run.error}
            oppCount={opps.length} onOpenQuery={setDrawerQ} onComplete={completeInvestigation} />
        )}
        {screen === "board" && (
          <OpportunityBoard key="board" opportunities={opps} onOpenQuery={setDrawerQ}
            onOpenDetail={openDetail} onAction={runAction} />
        )}
        {screen === "detail" && (
          <OpportunityDetail key={"detail-" + detailId} opp={oppById(detailId)} onBack={() => go("board")}
            onOpenQuery={setDrawerQ} onAction={runAction} createdArtifact={artifacts[detailId]} />
        )}
        {screen === "verdict" && (
          <ValidationVerdict key={"verdict-" + task} task={task}
            verdict={run.verdict ? MinervaTransport.adaptVerdict(run.verdict) : null}
            onBack={() => go("investigation")}
            onOpenQuery={setDrawerQ} onAction={runAction} onRunDiscovery={runDiscovery} onJumpToOpp={jumpToOpp} />
        )}
      </main>

      {showFooter && <SelfObs stats={run.selfStats} />}

      {drawerQ != null && <DqlDrawer query={drawerQ} onClose={() => setDrawerQ(null)} />}
      {action && <ActionModal action={action} onClose={() => setAction(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
