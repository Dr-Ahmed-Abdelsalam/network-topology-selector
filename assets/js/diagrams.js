// SVG topology diagrams (viewBox 300 x 200). Colors come from CSS classes.

export const ring = (cx, cy, rx, ry, n, s = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(s + (2 * Math.PI * i) / n), cy + ry * Math.sin(s + (2 * Math.PI * i) / n)]);
const f = (v) => v.toFixed(1);
export const L = (a, b, cls = "dg-edge") => `<line class="${cls}" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`;
export const N = (p, r = 9, cls = "") => `<circle class="dg-node ${cls}" cx="${f(p[0])}" cy="${f(p[1])}" r="${r}"/>`;
const H = (p, t, w = 54) => `<rect class="dg-hub" x="${p[0] - w / 2}" y="${p[1] - 11}" width="${w}" height="22" rx="5"/><text class="dg-hubtxt" x="${p[0]}" y="${p[1] + 3.5}" text-anchor="middle">${t}</text>`;

const DRAW = {
  bus() {
    let g = `<line class="dg-bus" x1="35" y1="100" x2="265" y2="100"/><rect class="dg-amber" x="29" y="88" width="10" height="24"/><rect class="dg-amber" x="261" y="88" width="10" height="24"/>`;
    [65, 100, 135, 170, 205, 240].forEach((x, i) => { const y = i % 2 ? 160 : 40; g += L([x, 100], [x, y]) + N([x, y]); });
    return g;
  },
  star() {
    const p = ring(150, 100, 105, 70, 6); let g = "";
    p.forEach((q) => (g += L([150, 100], q))); p.forEach((q) => (g += N(q)));
    return g + H([150, 100], "Switch");
  },
  ring(token = false) {
    const p = ring(150, 100, 105, 70, 6); let g = "";
    if (token) p.forEach((q) => (g += L([150, 100], q, "dg-faint")));
    p.forEach((q, i) => (g += L(q, p[(i + 1) % 6])));
    p.forEach((q) => (g += N(q)));
    if (token) {
      const m = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
      g += H([150, 100], "MSAU") + `<rect class="dg-amber" x="${f(m[0] - 7)}" y="${f(m[1] - 7)}" width="14" height="14" transform="rotate(45 ${f(m[0])} ${f(m[1])})"/>`;
    }
    return g;
  },
  "token-ring"() { return DRAW.ring(true); },
  tree() {
    const r = [150, 32], m = [[85, 95], [215, 95]]; let g = "";
    m.forEach((q) => (g += L(r, q)));
    m.forEach((q) => [-38, 0, 38].forEach((d) => { const leaf = [q[0] + d, 165]; g += L(q, leaf) + N(leaf); }));
    g += H(r, "Root"); m.forEach((q) => (g += H(q, "Switch")));
    return g;
  },
  mesh() {
    const p = ring(150, 100, 105, 72, 6); let g = "";
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 2], [1, 4], [2, 5], [3, 5]].forEach(([a, b]) => (g += L(p[a], p[b])));
    p.forEach((q, i) => (g += N(q, 9, [0, 2, 5].includes(i) ? "key" : "")));
    return g;
  },
  full() {
    const p = ring(150, 100, 95, 78, 5); let g = "";
    for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) g += L(p[a], p[b]);
    p.forEach((q) => (g += N(q)));
    return g;
  },
  hybrid() {
    // two redundant core switches, three access switches, end devices
    const c1 = [110, 30], c2 = [190, 30], acc = [[60, 105], [150, 105], [240, 105]]; let g = L(c1, c2);
    acc.forEach((a) => { g += L(a, c1) + L(a, c2); [-26, 0, 26].forEach((d) => { const e = [a[0] + d, 172]; g += L(a, e) + N(e, 8); }); });
    g += H(c1, "Core") + H(c2, "Core"); acc.forEach((a) => (g += H(a, "Access", 56)));
    return g;
  },
};

export function diagram(id, label = id) {
  const draw = DRAW[id];
  const body = draw ? draw() : `<text class="dg-missing" x="150" y="105" text-anchor="middle">No diagram for "${String(id).replace(/[<>&"]/g, "")}"</text>`;
  return `<svg viewBox="0 0 300 200" role="img" aria-label="${String(label).replace(/[<>&"]/g, "")} diagram">${body}</svg>`;
}

export const hasDiagram = (id) => Object.prototype.hasOwnProperty.call(DRAW, id);
