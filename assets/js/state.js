// Shareable URL state. Format: #mode=choose&devices=120&org=enterprise&...&w=34352345
// Legacy v1 links (#w=12345678) still open the Compare view with those weights.
import { clampWeight } from "./scoring.js";

export const MODES = ["compare", "choose", "method"];

export function encodeState({ mode, inputs = {}, weights = null }, criteria) {
  const p = new URLSearchParams();
  p.set("mode", MODES.includes(mode) ? mode : "compare");
  for (const [k, v] of Object.entries(inputs)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  if (weights) p.set("w", criteria.map((c) => clampWeight(weights[c.id])).join(""));
  return "#" + p.toString();
}

/**
 * Parse a location hash. Unknown keys are ignored, malformed weights are dropped,
 * and an unknown mode falls back to "compare". Never throws.
 */
export function decodeState(hash, criteria, rules) {
  const out = { mode: "compare", inputs: {}, weights: null, legacy: false };
  const s = String(hash || "").replace(/^#/, "");
  if (!s) return out;
  let p;
  try { p = new URLSearchParams(s); } catch { return out; }
  const w = p.get("w");
  if (w && new RegExp(`^[0-5]{${criteria.length}}$`).test(w)) {
    out.weights = Object.fromEntries(criteria.map((c, i) => [c.id, Number(w[i])]));
  }
  const mode = p.get("mode");
  if (mode && MODES.includes(mode)) out.mode = mode;
  else if (!mode && out.weights) out.legacy = true;
  const ids = new Set(rules.questions.map((q) => q.id));
  for (const [k, v] of p.entries()) if (ids.has(k)) out.inputs[k] = v;
  return out;
}
