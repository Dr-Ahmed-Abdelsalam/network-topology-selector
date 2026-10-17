// Shared rendering helpers (DOM). Kept free of decision logic.

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n, d = 2) => Number(n).toFixed(d);

/** Pastel red -> amber -> green for a 1-10 score (always paired with the number itself). */
export function heat(s) {
  const lo = [244, 182, 176], mid = [251, 227, 166], hi = [169, 221, 191], t = (s - 1) / 9;
  const [a, b, u] = t <= 0.5 ? [lo, mid, t / 0.5] : [mid, hi, (t - 0.5) / 0.5];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(",")})`;
}

export const CATEGORY = {
  physical: "Physical topology",
  "logical-mac": "Access method on a logical ring",
  "special-case": "Special case of mesh",
};
export const STATUS = { current: "In use today", niche: "Niche today", legacy: "Legacy" };

export function badges(t) {
  return `<span class="badge cat-${esc(t.category)}">${esc(CATEGORY[t.category] || t.category)}</span><span class="badge st-${esc(t.status)}">${esc(STATUS[t.status] || t.status)}</span>`;
}

export function refLinks(ids, data) {
  if (!ids || !ids.length) return `<span class="judg" title="No direct source; author's analytical judgement">author judgement</span>`;
  return ids.map((id) => {
    const r = data.references.find((x) => x.id === id);
    return `<a class="ref" href="#mode=method" data-ref="${id}" title="${esc(r ? r.text : "")}">[${id}]</a>`;
  }).join(" ");
}

/**
 * Weight sliders. `weights` is mutated in place; onChange runs after each move.
 * `notes` (optional) maps criterion id -> short HTML shown under the label.
 */
export function renderSliders(container, criteria, weights, onChange, notes = null) {
  const sum = () => criteria.reduce((a, c) => a + weights[c.id], 0);
  container.innerHTML = criteria.map((c) => `
    <div class="weight">
      <label for="${container.id}-${c.id}"><span>${esc(c.name)}</span><span class="val" id="${container.id}-v-${c.id}"></span></label>
      <div class="best">${notes ? notes[c.id] || "" : "10 = " + esc(c.best)}</div>
      <input type="range" id="${container.id}-${c.id}" min="0" max="5" step="1" value="${weights[c.id]}" data-c="${c.id}">
    </div>`).join("");
  const paint = () => {
    const s = sum();
    criteria.forEach((c) => {
      const el = document.getElementById(`${container.id}-v-${c.id}`);
      if (el) el.innerHTML = `${weights[c.id]} <small>(${s ? Math.round((100 * weights[c.id]) / s) : 0}%)</small>`;
      const input = document.getElementById(`${container.id}-${c.id}`);
      if (input) { input.value = weights[c.id]; input.setAttribute("aria-valuetext", `${weights[c.id]} of 5`); }
    });
  };
  container.oninput = (e) => {
    const id = e.target.dataset.c;
    if (!id) return;
    weights[id] = Number(e.target.value);
    paint();
    onChange(id);
  };
  paint();
  return paint;
}

/** Ranked list with bars. opts: { leaderId, eligibility, tieIds, leadLabel } */
export function renderRanking(ol, rows, opts = {}) {
  const { leaderId = rows[0]?.id, eligibility = null, tieIds = [], leadLabel = "Recommended" } = opts;
  ol.innerHTML = rows.map((r, i) => {
    const el = eligibility ? eligibility[r.id] : { eligible: true, reasons: [] };
    const tags = [];
    if (r.id === leaderId) tags.push(`<span class="tag lead">${esc(leadLabel)}</span>`);
    if (tieIds.includes(r.id)) tags.push(`<span class="tag">near tie</span>`);
    if (!el.eligible) tags.push(`<span class="tag off" title="${esc(el.reasons.join(" "))}">not recommended</span>`);
    return `<li class="${r.id === leaderId ? "lead-row" : ""}${el.eligible ? "" : " off"}">
      <span class="pos">${i + 1}</span>
      <span class="name">${esc(r.name)} ${tags.join("")}</span>
      <span class="bar" aria-hidden="true"><span style="width:${(r.score * 10).toFixed(1)}%"></span></span>
      <span class="num">${fmt(r.score)}</span>
      ${el.eligible ? "" : `<span class="why-off">${esc(el.reasons[0])}</span>`}
    </li>`;
  }).join("");
}

export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
