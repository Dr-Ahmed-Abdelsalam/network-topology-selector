// NetTopoRank: wiring between data, engine and views.
import { loadData } from "./data.js";
import { rank, topEligible, nearTies, contributions } from "./scoring.js";
import { validateInputs, deriveWeights, UNKNOWN } from "./requirements.js";
import { assessScenario, assumptions } from "./scenario.js";
import { oneAtATime, stability, overtakeConditions } from "./sensitivity.js";
import { encodeState, decodeState, MODES } from "./state.js";
import { diagram } from "./diagrams.js";
import { $, esc, fmt, heat, badges, refLinks, renderSliders, renderRanking, toast, store } from "./ui.js";
import { initIntro } from "./intro.js";

let D, R, C, T;
const S = { mode: "compare", explore: {}, values: null, raw: {}, derived: null, weights: null, budgetAmount: "", result: null };
const equalWeights = () => Object.fromEntries(C.map((c) => [c.id, 3]));
const PRESETS = [
  { id: "equal", name: "Equal weights", w: { architecture: 3, delay: 3, complexity: 3, security: 3, congestion: 3, routing: 3, reliability: 3, cost: 3 } },
  { id: "office", name: "Small office", w: { architecture: 2, delay: 3, complexity: 5, security: 3, congestion: 2, routing: 3, reliability: 3, cost: 5 } },
  { id: "campus", name: "Enterprise campus", w: { architecture: 5, delay: 4, complexity: 3, security: 4, congestion: 4, routing: 3, reliability: 4, cost: 2 } },
  { id: "dc", name: "Data center", w: { architecture: 3, delay: 5, complexity: 1, security: 4, congestion: 5, routing: 5, reliability: 5, cost: 1 } },
  { id: "critical", name: "Banking / critical", w: { architecture: 2, delay: 4, complexity: 1, security: 5, congestion: 3, routing: 4, reliability: 5, cost: 1 } },
  { id: "budget", name: "Lowest budget", w: { architecture: 1, delay: 1, complexity: 4, security: 1, congestion: 1, routing: 1, reliability: 1, cost: 5 } },
];
const EXAMPLE = { devices: "180", org: "enterprise", budget: "moderate", reliability: "high", traffic: "moderate", latency: "sensitive", security: "elevated", growth: "moderate", redundancy: "yes", scope: "building" };

// ---------------- routing & URL ----------------
function setMode(mode, { push = true, focus = true } = {}) {
  S.mode = MODES.includes(mode) ? mode : "compare";
  for (const m of MODES) $("view-" + m).hidden = m !== S.mode;
  document.querySelectorAll(".modes [data-mode]").forEach((a) => a.setAttribute("aria-current", a.dataset.mode === S.mode ? "page" : "false"));
  if (push) writeHash();
  if (focus) { window.scrollTo({ top: 0 }); $("main").focus({ preventScroll: true }); }
}
function writeHash() {
  let st = { mode: S.mode };
  if (S.mode === "compare") st.weights = S.explore;
  if (S.mode === "choose" && S.values) {
    const inputs = {};
    R.questions.forEach((q) => { const v = S.values[q.id]; if (v !== undefined && v !== UNKNOWN) inputs[q.id] = v; });
    st = { mode: "choose", inputs, weights: S.weights };
  }
  history.replaceState(null, "", encodeState(st, C));
}

// ---------------- compare view ----------------
function renderPrimer() {
  const items = [
    ["Physical vs logical", "Physical topology is how cables and devices are laid out. Logical topology is how data actually flows. Token Ring is logically a ring but is usually wired physically as a star."],
    ["Switching vs routing", "A switch forwards frames inside one network; a router chooses paths between networks. A mesh only provides alternative paths; protocols decide which one is used."],
    ["Media access", "On a shared medium, devices need rules for who may send: CSMA/CD on classic Ethernet, token passing on Token Ring. A switched star gives each device its own link."],
    ["Mesh and full mesh", "Fully connected is a special case of mesh in which every pair of nodes is linked. It needs n(n−1)/2 links, so it only suits a handful of critical nodes."],
  ];
  $("primer").innerHTML = items.map(([h, p]) => `<div class="concept"><h3>${h}</h3><p>${p}</p></div>`).join("");
}

function renderCards() {
  $("cards").innerHTML = T.map((t) => `
    <article class="card" data-t="${t.id}" tabindex="0" aria-label="${esc(t.name)}: show score justification">
      <div class="card-dg">${diagram(t.id, t.name)}</div>
      <div class="card-body">
        <h3>${esc(t.name)} <span class="aka">${esc(t.aka || "")}</span></h3>
        <div class="badges">${badges(t)}</div>
        <p>${esc(t.how)}</p>
        <p class="muted"><strong>Today:</strong> ${esc(t.today)}</p>
        <p class="muted"><strong>Limits:</strong> ${esc(t.limits)}</p>
        <p class="total">Baseline total <strong>${t.baselineScores.reduce((a, b) => a + b, 0)}</strong> / 80</p>
      </div>
    </article>`).join("");
  const open = (e) => { const c = e.target.closest(".card"); if (!c) return; showDetail(c.dataset.t); $("detailPanel").scrollIntoView({ behavior: "smooth", block: "start" }); };
  $("cards").addEventListener("click", open);
  $("cards").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } });
}

function renderMatrix() {
  const short = (n) => n.split(" /")[0].replace("Congestion control", "Congestion").replace("Routing methodology", "Routing");
  const head = `<thead><tr><th scope="col">Topology</th>${C.map((c) => `<th scope="col" title="${esc(c.name)}">${esc(short(c.name))}</th>`).join("")}<th scope="col">Total / 80</th></tr></thead>`;
  const body = T.map((t) => `<tr><th scope="row" class="rowname"><button type="button" data-t="${t.id}">${esc(t.name)}</button></th>${t.baselineScores.map((s, i) => `<td style="background:${heat(s)}" title="${esc(C[i].name)}: ${esc(t.justification[i].text)}">${s}</td>`).join("")}<td class="tot">${t.baselineScores.reduce((a, b) => a + b, 0)}</td></tr>`).join("");
  $("matrix").innerHTML = head + "<tbody>" + body + "</tbody>";
  $("matrix").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { showDetail(b.dataset.t); $("detailPanel").scrollIntoView({ behavior: "smooth", block: "start" }); } });
}

function renderTabs() {
  $("tabs").innerHTML = T.map((t) => `<button type="button" class="tab" role="tab" id="tab-${t.id}" aria-controls="detail" data-t="${t.id}" aria-selected="false" tabindex="-1">${esc(t.name)}</button>`).join("");
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) showDetail(b.dataset.t); });
  $("tabs").addEventListener("keydown", (e) => {
    const ids = T.map((t) => t.id), i = ids.indexOf(document.activeElement?.dataset?.t);
    if (i < 0) return;
    const next = e.key === "ArrowRight" ? (i + 1) % ids.length : e.key === "ArrowLeft" ? (i - 1 + ids.length) % ids.length : e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : -1;
    if (next >= 0) { e.preventDefault(); showDetail(ids[next]); $("tab-" + ids[next]).focus(); }
  });
}
function showDetail(id) {
  const t = T.find((x) => x.id === id);
  document.querySelectorAll(".tab").forEach((b) => { const on = b.dataset.t === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
  $("detail").setAttribute("aria-labelledby", "tab-" + id);
  $("detail").innerHTML = `
    <div>
      <div class="diagram">${diagram(t.id, t.name)}</div>
      <div class="badges">${badges(t)}</div>
      <p class="desc">${esc(t.description)}</p>
      <p class="src">Baseline total ${t.baselineScores.reduce((a, b) => a + b, 0)} / 80</p>
    </div>
    <table class="just"><thead><tr><th scope="col">Criterion</th><th scope="col">Score</th><th scope="col">Reason</th><th scope="col">Source</th></tr></thead><tbody>${C.map((c, i) => `<tr>
      <th scope="row">${esc(c.name)}</th>
      <td class="sc" style="background:${heat(t.baselineScores[i])}" title="Rubric: 1 = ${esc(c.rubric[1])}; 5 = ${esc(c.rubric[5])}; 10 = ${esc(c.rubric[10])}">${t.baselineScores[i]}</td>
      <td>${esc(t.justification[i].text)}</td>
      <td class="srcs">${refLinks(t.justification[i].refs, D)}</td></tr>`).join("")}</tbody></table>`;
}

let paintExplore = () => {};
function renderExplore() {
  $("presets").innerHTML = PRESETS.map((p) => `<button type="button" class="preset" data-p="${p.id}" aria-pressed="false">${esc(p.name)}</button>`).join("");
  $("presets").addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (!b) return; Object.assign(S.explore, PRESETS.find((p) => p.id === b.dataset.p).w); paintExplore(); updateExplore(); });
  paintExplore = renderSliders($("exploreWeights"), C, S.explore, updateExplore);
  $("reset").addEventListener("click", () => { Object.assign(S.explore, equalWeights()); paintExplore(); updateExplore(); });
}
function updateExplore() {
  const pid = PRESETS.find((p) => C.every((c) => p.w[c.id] === S.explore[c.id]))?.id;
  document.querySelectorAll(".preset").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === pid)));
  const r = rank(T, S.explore, C);
  if (!r.length) { $("exploreRanking").innerHTML = `<li class="empty">Set at least one weight above 0.</li>`; }
  else renderRanking($("exploreRanking"), r, { leaderId: r[0].id, leadLabel: "Top score", tieIds: nearTies(r, r[0].id, R.scenario.nearTie).map((x) => x.id) });
  if (S.mode === "compare") writeHash();
}

// ---------------- choose view ----------------
function renderForm() {
  $("formFields").innerHTML = R.questions.map((q) => {
    const help = q.help ? `<p class="help" id="help-${q.id}">${esc(q.help)}</p>` : "";
    const err = `<p class="field-error" id="err-${q.id}"></p>`;
    const desc = `aria-describedby="${q.help ? "help-" + q.id + " " : ""}err-${q.id}"`;
    if (q.type === "number") {
      return `<div class="field"><label for="f-${q.id}">${esc(q.label)} <span class="req" aria-hidden="true">*</span></label>
        <input id="f-${q.id}" name="${q.id}" type="number" inputmode="numeric" min="${q.min}" max="${q.max}" step="1" ${q.required ? "required" : ""} ${desc} placeholder="e.g. 40">${help}${err}</div>`;
    }
    return `<div class="field"><label for="f-${q.id}">${esc(q.label)}</label>
      <select id="f-${q.id}" name="${q.id}" ${desc}><option value="${UNKNOWN}">Not sure</option>${q.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select>${help}${err}</div>`;
  }).join("");
  $("reqForm").addEventListener("submit", (e) => { e.preventDefault(); submitForm(true); });
  $("exampleBtn").addEventListener("click", () => { fillForm(EXAMPLE); submitForm(true); });
  $("restoreWeights").addEventListener("click", () => { Object.assign(S.weights, S.derived.weights); paintDecide(); runDecision(); });
  $("copyLink").addEventListener("click", copyLink);
  $("downloadJson").addEventListener("click", downloadJson);
  $("printReport").addEventListener("click", () => window.print());
}
function fillForm(inputs) {
  R.questions.forEach((q) => { const el = $("f-" + q.id); if (el && inputs[q.id] !== undefined) el.value = inputs[q.id]; });
}
function readForm() {
  const raw = {};
  R.questions.forEach((q) => (raw[q.id] = $("f-" + q.id).value));
  return raw;
}

let paintDecide = () => {};
function submitForm(scroll, weightsOverride = null) {
  const raw = readForm();
  const { valid, errors, values } = validateInputs(raw, R);
  R.questions.forEach((q) => {
    const el = $("f-" + q.id), msg = errors[q.id] || "";
    $("err-" + q.id).textContent = msg;
    el.setAttribute("aria-invalid", msg ? "true" : "false");
  });
  if (!valid) {
    $("formError").textContent = "Please fix the highlighted field.";
    $("f-" + Object.keys(errors)[0]).focus();
    return;
  }
  $("formError").textContent = "";
  S.values = values;
  S.budgetAmount = $("budgetAmount").value.trim();
  S.derived = deriveWeights(values, R, C);
  S.weights = { ...(weightsOverride || S.derived.weights) };
  paintDecide = renderSliders($("decideWeights"), C, S.weights, () => runDecision(), traceNotes());
  $("results").hidden = false;
  runDecision();
  if (scroll) $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}
function traceNotes() {
  return Object.fromEntries(C.map((c) => {
    const tr = S.derived.trace[c.id];
    const txt = tr.length ? tr.map((x) => `${x.delta > 0 ? "+" : "−"}${Math.abs(x.delta)} ${esc(x.answer)}`).join(" · ") : "no answer changed it";
    return [c.id, `Base ${R.baseWeight} · ${txt}<span class="adj" id="adj-${c.id}"></span>`];
  }));
}

function runDecision() {
  const v = S.values, W = S.weights;
  C.forEach((c) => { const a = $("adj-" + c.id); if (a) a.textContent = W[c.id] !== S.derived.weights[c.id] ? " · adjusted by you" : ""; });
  const scen = assessScenario(v, D, R);
  const el = (id) => scen.eligibility[id].eligible;
  const ranked = rank(T, W, C);
  writeHash();
  if (!ranked.length) {
    $("recPanel").innerHTML = `<h2 id="h-rec">No priorities set</h2><p>All weights are zero. Raise at least one weight, or select "Restore from answers".</p>`;
    ["whyBody", "sensBody"].forEach((id) => ($(id).innerHTML = ""));
    $("decideRanking").innerHTML = "";
    S.result = null;
    return;
  }
  const top = topEligible(ranked, el);
  const ties = top ? nearTies(ranked, top.id, R.scenario.nearTie, el) : [];
  const oat = oneAtATime(T, W, C, el);
  const st = stability(T, W, C, el);
  const conds = overtakeConditions(T, W, C, el);
  S.result = { scen, ranked, top, ties, oat, st, conds };
  renderRec(); renderWhy(); renderSens();
  renderRanking($("decideRanking"), ranked, { leaderId: top?.id, eligibility: scen.eligibility, tieIds: ties.map((x) => x.id) });
  const extra = S.budgetAmount ? [`Budget noted for the report: ${S.budgetAmount} (category: ${labelOf("budget", v.budget)}).`] : [];
  $("assumeList").innerHTML = [...assumptions(v), ...extra].map((a) => `<li>${esc(a)}</li>`).join("");
  renderRefsUsed();
}
const labelOf = (qid, val) => R.questions.find((q) => q.id === qid)?.options?.find((o) => o.value === val)?.label || "not sure";

function renderRec() {
  const { scen, top, ties } = S.result;
  const warn = scen.warnings.length ? `<ul class="warnings">${scen.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "";
  const tieTxt = ties.length ? `<p class="note">Close alternative${ties.length > 1 ? "s" : ""}: ${ties.map((r) => `<strong>${esc(r.name)}</strong> (${fmt(r.score)})`).join(", ")}, within ${R.scenario.nearTie} points; treat as a near tie.</p>` : "";
  const t = top && T.find((x) => x.id === top.id);
  const single = t ? `
      <div class="rec-single">
        <div class="rec-dg">${diagram(t.id, t.name)}</div>
        <div>
          <div class="label">${scen.hybrid ? "Best single textbook topology for your priorities" : "Recommended topology"}</div>
          <h3>${esc(t.name)}</h3>
          <div class="score">Weighted score <b>${fmt(top.score)}</b> / 10</div>
          <p>${esc(t.description)}</p>
          ${tieTxt}
        </div>
      </div>` : `<p>None of the seven options passes the scenario checks for these requirements. See the ranking below for the reasons.</p>`;
  if (scen.hybrid) {
    const h = scen.hybrid;
    $("recPanel").innerHTML = `
      <div class="label">Recommended architecture</div>
      <h2 id="h-rec">${esc(h.title)}</h2>
      <div class="rec-hybrid">
        <div class="rec-dg">${diagram("hybrid", "Hierarchical hybrid")}</div>
        <div>
          <p>Recommended because ${esc(h.reasons.join(", "))}. Real networks of this kind combine topologies in layers rather than using one textbook shape ${refLinks(h.refs, D)}.</p>
          <table class="layers"><tbody>${h.layers.map((l) => `<tr><th scope="row">${esc(l.layer)}</th><td><strong>${esc(l.topology)}</strong></td><td>${esc(l.detail)}</td></tr>`).join("")}</tbody></table>
        </div>
      </div>
      ${single}${warn}`;
  } else {
    $("recPanel").innerHTML = `<h2 id="h-rec" class="sr-only">Recommendation</h2>${single}${warn}`;
  }
}

function renderWhy() {
  const { top, scen } = S.result;
  if (!top) { $("whyBody").innerHTML = ""; return; }
  const t = T.find((x) => x.id === top.id);
  const parts = contributions(t.baselineScores, S.weights, C).filter((p) => p.weight > 0).sort((a, b) => b.weight - a.weight || b.score - a.score);
  const heavy = parts.slice(0, 3).map((p) => `${esc(p.name)} (${p.weight})`).join(", ");
  const strong = parts.filter((p) => p.score >= 8), weak = parts.filter((p) => p.score <= 4);
  const maxShare = Math.max(...parts.map((p) => p.share));
  const excluded = T.filter((x) => !scen.eligibility[x.id].eligible);
  $("whyBody").innerHTML = `
    <p>Your answers put the most weight on ${heavy}. Each bar is that criterion's share of ${esc(t.name)}'s weighted score.</p>
    <ul class="contrib">${parts.map((p) => `<li><span>${esc(p.name)}</span><span class="cbar"><span style="width:${(100 * p.share / maxShare).toFixed(0)}%;background:${heat(p.score)}"></span></span><span class="cnum">w ${p.weight} × s ${p.score}</span></li>`).join("")}</ul>
    <div class="chips">${strong.map((p) => `<span class="chip pos">✓ ${esc(p.name)} ${p.score}/10</span>`).join("")}${weak.map((p) => `<span class="chip neg">⚠ ${esc(p.name)} ${p.score}/10</span>`).join("")}</div>
    ${weak.length ? `<p class="note">Weak points are listed separately because a weighted sum lets strong criteria hide weak ones.</p>` : ""}
    ${excluded.length ? `<h3 class="h3s">Not recommended here</h3><ul class="plain small">${excluded.map((x) => `<li><strong>${esc(x.name)}</strong>: ${esc(scen.eligibility[x.id].reasons.join(" "))}</li>`).join("")}</ul>` : ""}`;
}

function renderSens() {
  const { oat, st, conds, scen, top } = S.result;
  if (!top) { $("sensBody").innerHTML = ""; return; }
  const pct = Math.round(st.share * 100);
  const verdict = pct >= 90 ? "Very stable" : pct >= 70 ? "Stable" : pct >= 50 ? "Sensitive" : "Fragile";
  const nm = (id) => T.find((t) => t.id === id)?.name || id;
  const flips = oat.flips.length
    ? `<ul class="plain small">${oat.flips.map((f) => `<li>If <strong>${esc(f.name)}</strong> goes from ${f.from} to ${f.to}, <strong>${esc(nm(f.winner))}</strong> becomes the recommendation.</li>`).join("")}</ul>`
    : `<p>No single ±1 change to any weight changes the recommendation.</p>`;
  const cond = conds.length
    ? `<ul class="plain small">${conds.slice(0, 4).map((c) => `<li><strong>${esc(c.name)}</strong> would win if ${esc(c.criterionName)} were weighted ${c.to} instead of ${c.from}.</li>`).join("")}</ul>`
    : `<p>No other eligible option can win by changing a single weight.</p>`;
  const unlock = [];
  const full = scen.eligibility.full, mesh = scen.eligibility.mesh;
  if (!mesh.eligible && S.values.redundancy === "no") unlock.push("Mesh options become candidates if backup links and spare equipment become available.");
  if (!full.eligible && S.values.devices > R.scenario.fullMeshMaxNodes) unlock.push(`Fully connected suits a small core of up to about ${R.scenario.fullMeshMaxNodes} nodes, not ${S.values.devices.toLocaleString("en")} devices.`);
  $("sensBody").innerHTML = `
    <div class="stab"><span class="stab-num">${pct}%</span><span><strong>${verdict}.</strong> In ${st.samples} random variations of every weight by up to ±${Math.round(st.spread * 100)}%, ${esc(nm(st.base))} stayed on top ${pct}% of the time.</span></div>
    <h3 class="h3s">One weight at a time (±1)</h3>${flips}
    <h3 class="h3s">When another option would be better</h3>${cond}
    ${unlock.length ? `<ul class="plain small">${unlock.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}`;
}

function renderRefsUsed() {
  const { top, scen } = S.result;
  const ids = new Set();
  if (top) {
    const t = T.find((x) => x.id === top.id);
    t.refs.forEach((r) => ids.add(r));
    C.forEach((c, i) => { if (S.weights[c.id] > 0) t.justification[i].refs.forEach((r) => ids.add(r)); });
  }
  if (scen.hybrid) scen.hybrid.refs.forEach((r) => ids.add(r));
  const refs = D.references.filter((r) => ids.has(r.id));
  $("refsUsed").innerHTML = refs.map((r) => `<li><span class="rstat st-${esc(r.status)}">${esc(r.status)}</span> [${r.id}] ${esc(r.text)} <a href="${esc(r.url)}" target="_blank" rel="noopener">link</a></li>`).join("")
    + `<li class="muted">Scores themselves are the author's assessment; sources support the reasons, not the numbers.</li>`;
}

// ---------------- export ----------------
function copyLink() {
  const url = location.href;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("Link copied"), () => toast("Copy this link: " + url));
}
function downloadJson() {
  if (!S.result) return;
  const { scen, ranked, top, ties, oat, st, conds } = S.result;
  const report = {
    tool: "NetTopoRank", generatedAt: new Date().toISOString(), link: location.href,
    disclaimer: "Educational guidance, not an engineering-validated design.",
    scoresBasis: D.scale.basis,
    inputs: { ...S.values, budgetNote: S.budgetAmount || undefined },
    weights: S.weights, weightsFromAnswers: S.derived.weights,
    recommendation: scen.hybrid ? { type: "hybrid", title: scen.hybrid.title, layers: scen.hybrid.layers, reasons: scen.hybrid.reasons, bestSingleTopology: top && { id: top.id, score: +top.score.toFixed(3) } } : { type: "topology", id: top?.id, name: top?.name, score: top && +top.score.toFixed(3) },
    nearTies: ties.map((r) => r.id),
    ranking: ranked.map((r) => ({ id: r.id, name: r.name, score: +r.score.toFixed(3), recommended: scen.eligibility[r.id].eligible, reasons: scen.eligibility[r.id].reasons })),
    sensitivity: { stability: st.share, samples: st.samples, spread: st.spread, oneAtATimeFlips: oat.flips, overtakeConditions: conds },
    warnings: scen.warnings, assumptions: assumptions(S.values),
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "nettoporank-report.json" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------- method view ----------------
function renderMethod() {
  $("rubric").innerHTML = `<thead><tr><th scope="col">Criterion</th><th scope="col">1</th><th scope="col">5</th><th scope="col">10</th></tr></thead><tbody>${C.map((c) => `<tr><th scope="row">${esc(c.name)}</th><td>${esc(c.rubric[1])}</td><td>${esc(c.rubric[5])}</td><td>${esc(c.rubric[10])}</td></tr>`).join("")}</tbody>`;
  const cname = (id) => C.find((c) => c.id === id)?.name || id;
  const rows = R.questions.filter((q) => q.type === "choice").flatMap((q) => q.options.map((o, i) => `<tr>${i === 0 ? `<th scope="rowgroup" rowspan="${q.options.length}">${esc(q.label)}</th>` : ""}<td>${esc(o.label)}</td><td>${Object.entries(o.deltas || {}).map(([k, d]) => `${esc(cname(k))} ${d > 0 ? "+" : "−"}${Math.abs(d)}`).join(", ") || "—"}</td></tr>`));
  const sc = R.scenario;
  $("rulesTable").innerHTML = `<thead><tr><th scope="col">Question</th><th scope="col">Answer</th><th scope="col">Weight change</th></tr></thead><tbody>${rows.join("")}</tbody>
    <tfoot><tr><td colspan="3">
      <strong>Scenario checks</strong> (scores unchanged): Legacy options (Bus, Token-ring) are never recommended ·
      Fully connected is not recommended above ${sc.fullMeshMaxNodes} nodes ·
      Mesh options are not recommended without redundant links ·
      A hierarchical hybrid is proposed for ${sc.hybridMinDevices}+ devices, campus or multi-site scope, or enterprise, data-center and critical organizations ·
      ${sc.lowConfidenceUnknowns}+ "Not sure" answers trigger a low-confidence warning ·
      Options within ${sc.nearTie} points are reported as near ties.
    </td></tr></tfoot>`;
  $("limits").innerHTML = D.limitations.map((l) => `<li>${esc(l)}</li>`).join("");
  $("refs").innerHTML = D.references.map((r) => `
    <li id="ref-${r.id}">
      <span class="rstat st-${esc(r.status)}">${esc(r.status)}</span> ${esc(r.text)}
      <br><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>
      <div class="refmeta">Checked ${esc(r.checkedOn)}: ${esc(r.verifiedFields.join("; "))}.${r.location ? " Location: " + esc(r.location) + "." : ""} Pages: ${r.pages ? esc(r.pages) : "not verified"}.${r.note ? " " + esc(r.note) : ""}</div>
    </li>`).join("");
}

// ---------------- boot ----------------
loadData().then(({ data, rules }) => {
  D = data; R = rules; C = D.criteria; T = D.topologies;
  S.explore = equalWeights();
  renderPrimer(); renderCards(); renderMatrix(); renderTabs(); renderExplore(); renderForm(); renderMethod();
  showDetail("star");

  const st = decodeState(location.hash, C, R);
  if (st.weights && st.mode !== "choose") Object.assign(S.explore, st.weights);
  paintExplore();
  setMode(st.mode, { push: false, focus: false });
  updateExplore();
  const shared = st.mode === "choose" && st.inputs.devices;
  if (shared) { fillForm(st.inputs); submitForm(false, st.weights); }
  writeHash();

  document.querySelector(".modes").addEventListener("click", (e) => {
    const a = e.target.closest("[data-mode]");
    if (!a) return;
    e.preventDefault();
    setMode(a.dataset.mode);
  });
  document.addEventListener("click", (e) => {
    const r = e.target.closest("[data-ref]");
    if (!r) return;
    e.preventDefault();
    setMode("method", { focus: false });
    const li = $("ref-" + r.dataset.ref);
    if (li) { li.scrollIntoView({ behavior: "smooth", block: "center" }); li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1600); }
  });
  document.querySelector(".brand").addEventListener("click", (e) => { e.preventDefault(); setMode("compare"); });
  window.addEventListener("hashchange", () => { const s = decodeState(location.hash, C, R); if (s.mode !== S.mode) setMode(s.mode, { push: false }); });

  const intro = initIntro({ data: D, rules: R, onChoose: () => { setMode("choose"); $("f-devices").focus(); }, onCompare: () => setMode("compare") });
  $("replayIntro").addEventListener("click", () => intro.open());
  if (!store.get("ntr.introSeen") && !shared && !st.legacy) intro.open();
}).catch((err) => {
  $("main").innerHTML = `<section class="panel"><h2>Could not load the data</h2><p class="hint">${esc(err.message)}</p><p class="hint">Open the site through GitHub Pages or a local server (for example <code>python -m http.server</code>), not directly from the file system.</p></section>`;
});
