// Animated "how it works" intro: 4 short scenes, skippable, shown on first visit.
// The animated rankings are computed live with the real engine.
import { rank } from "./scoring.js";
import { validateInputs, deriveWeights } from "./requirements.js";
import { diagram } from "./diagrams.js";
import { assessScenario } from "./scenario.js";
import { $, esc, heat, store } from "./ui.js";

const PERSONAS = [
  { name: "Small office", sub: "20 devices · tight budget · simple to run", inputs: { devices: "20", org: "small_business", budget: "limited", reliability: "standard", traffic: "light", latency: "tolerant", security: "basic", growth: "stable", redundancy: "no", scope: "room" } },
  { name: "Bank branch network", sub: "security and uptime first · budget secondary", inputs: { devices: "300", org: "critical", budget: "generous", reliability: "mission_critical", traffic: "moderate", latency: "sensitive", security: "regulated", growth: "moderate", redundancy: "yes", scope: "campus" } },
];

export function initIntro({ data, rules, onChoose, onCompare }) {
  const C = data.criteria, T = data.topologies;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const personas = PERSONAS.map((p) => {
    const values = validateInputs(p.inputs, rules).values;
    return { ...p, weights: deriveWeights(values, rules, C).weights, eligibility: assessScenario(values, data, rules).eligibility };
  });
  // Persona rankings exclude legacy options, as Decision mode does.
  const ranked = personas.map((p) => rank(T, p.weights, C).filter((r) => T.find((t) => t.id === r.id).status !== "legacy"));
  let step = 0, timer = null, personaTimer = null, persona = 0, lastFocus = null;
  const short = (n) => n.split(" /")[0].replace("Congestion control", "Congestion").replace("Routing methodology", "Routing");

  const scenes = [
    () => `
      <h2 id="introTitle">Seven ways to connect a network</h2>
      <p>Bus, Star, Ring, Token-ring, Tree, Mesh and Fully connected. Each links devices differently, with different strengths.</p>
      <div class="i-grid">${T.map((t, i) => `<figure class="i-pop" style="--d:${i * 120}ms">${diagram(t.id, t.name)}<figcaption>${esc(t.name)}</figcaption></figure>`).join("")}</div>`,
    () => `
      <h2 id="introTitle">Fixed scores, grounded in references</h2>
      <p>Every topology is scored 1–10 on eight criteria. <strong>These baseline scores are the same for everyone</strong> and never change with your answers.</p>
      <div class="i-heat" role="img" aria-label="Scoring matrix of 7 topologies by 8 criteria">
        <span></span>${C.map((c) => `<span class="i-h">${esc(short(c.name))}</span>`).join("")}
        ${T.map((t, r) => `<span class="i-row">${esc(t.name)}</span>${t.baselineScores.map((s, k) => `<span class="i-cell" style="--d:${(r * 8 + k) * 22}ms;--cell:${heat(s)}">${s}</span>`).join("")}`).join("")}
      </div>`,
    () => `
      <h2 id="introTitle">Your needs set the priorities</h2>
      <p>You answer plain questions about your network. The answers become <strong>weights</strong>: how much each criterion matters to you.</p>
      <div class="i-persona"><strong id="iPName"></strong><span id="iPSub"></span></div>
      <div class="i-weights">${C.map((c) => `<div class="i-w"><span>${esc(short(c.name))}</span><span class="i-wbar"><span id="iw-${c.id}"></span></span><span class="i-wn" id="iwn-${c.id}"></span></div>`).join("")}</div>`,
    () => `
      <h2 id="introTitle">Scores × your weights = your ranking</h2>
      <p>The same fixed scores, weighted by different needs, give different answers. Options that do not fit the situation are greyed out, and every result comes with its reasons and a robustness check.</p>
      <div class="i-persona"><strong id="iPName"></strong><span id="iPSub"></span></div>
      <div class="i-rank" id="iRank" style="--n:${ranked[0].length}">${ranked[0].map((r) => `<div class="i-r" data-id="${r.id}"><span class="i-rn">${esc(r.name)}</span><span class="i-rbar"><span></span></span><span class="i-rs"></span></div>`).join("")}</div>
      <div class="i-cta"><button type="button" class="primary" id="iChoose">Choose a network</button><button type="button" class="ghost" id="iCompare">Explore the comparison</button></div>`,
  ];

  function paintPersona() {
    const p = personas[persona];
    const n = $("iPName"), s = $("iPSub");
    if (n) { n.textContent = p.name; s.textContent = p.sub; }
    C.forEach((c) => { const b = $("iw-" + c.id); if (b) { b.style.width = (p.weights[c.id] * 20) + "%"; $("iwn-" + c.id).textContent = p.weights[c.id]; } });
    const box = $("iRank");
    if (box) {
      const rows = ranked[persona];
      rows.forEach((r, i) => {
        const el = box.querySelector(`[data-id="${r.id}"]`);
        el.style.transform = `translateY(${i * 100}%)`;
        const ok = personas[persona].eligibility[r.id].eligible;
        el.classList.toggle("off", !ok);
        el.classList.toggle("lead", r.id === rows.find((x) => personas[persona].eligibility[x.id].eligible)?.id);
        el.querySelector(".i-rbar span").style.width = (r.score * 10).toFixed(1) + "%";
        el.querySelector(".i-rs").textContent = r.score.toFixed(2);
      });
    }
  }

  function render() {
    clearInterval(personaTimer); clearTimeout(timer);
    $("introStage").innerHTML = scenes[step]();
    $("introStage").classList.toggle("still", reduce);
    $("introStep").textContent = `${step + 1} / ${scenes.length}`;
    $("introDots").innerHTML = scenes.map((_, i) => `<span class="${i === step ? "on" : ""}"></span>`).join("");
    $("introPrev").disabled = step === 0;
    $("introNext").textContent = step === scenes.length - 1 ? "Close" : "Next";
    if (step >= 2) {
      persona = 0;
      requestAnimationFrame(paintPersona);
      if (!reduce) personaTimer = setInterval(() => { persona = 1 - persona; paintPersona(); }, 2600);
    }
    if (step === 3) {
      $("iChoose").addEventListener("click", () => { close(); onChoose(); });
      $("iCompare").addEventListener("click", () => { close(); onCompare(); });
    }
    if (!reduce && step < scenes.length - 1) timer = setTimeout(() => go(1), step >= 2 ? 6000 : 5200);
  }
  function go(d) {
    const n = step + d;
    if (n < 0) return;
    if (n >= scenes.length) { close(); return; }
    step = n; render();
  }
  function stopAuto() { clearTimeout(timer); }
  function open() {
    lastFocus = document.activeElement;
    step = 0;
    $("intro").hidden = false;
    document.body.classList.add("intro-open");
    render();
    $("introNext").focus();
  }
  function close() {
    clearTimeout(timer); clearInterval(personaTimer);
    $("intro").hidden = true;
    document.body.classList.remove("intro-open");
    store.set("ntr.introSeen", "1");
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  $("introNext").addEventListener("click", () => { stopAuto(); go(1); });
  $("introPrev").addEventListener("click", () => { stopAuto(); go(-1); });
  $("introSkip").addEventListener("click", close);
  $("intro").addEventListener("click", (e) => { if (e.target === $("intro")) close(); });
  $("intro").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowRight") { stopAuto(); go(1); }
    if (e.key === "ArrowLeft") { stopAuto(); go(-1); }
    if (e.key === "Tab") {
      const f = [...$("intro").querySelectorAll("button:not([disabled])")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $("introStage").addEventListener("pointerdown", stopAuto);

  return { open, close };
}
