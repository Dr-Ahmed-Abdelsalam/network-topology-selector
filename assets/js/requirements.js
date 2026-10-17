// Input validation and requirement -> weight mapping. Pure functions, no DOM.
import { clampWeight } from "./scoring.js";

export const UNKNOWN = "unknown";

/**
 * Validate raw form values against rules.questions.
 * Choice questions accept one of their option values or "unknown".
 * Returns { valid, errors: {id: message}, values: sanitized }.
 */
export function validateInputs(raw, rules) {
  const errors = {};
  const values = {};
  for (const q of rules.questions) {
    const v = raw?.[q.id];
    if (q.type === "number") {
      const s = v === undefined || v === null ? "" : String(v).trim();
      if (s === "") {
        if (q.required) errors[q.id] = "Please enter the number of devices.";
        continue;
      }
      if (!/^\d+$/.test(s)) { errors[q.id] = "Enter a whole number."; continue; }
      const n = Number(s);
      if (n < q.min || n > q.max) { errors[q.id] = `Enter a number between ${q.min} and ${q.max.toLocaleString("en")}.`; continue; }
      values[q.id] = n;
    } else {
      if (v === undefined || v === null || v === "" || v === UNKNOWN) { values[q.id] = UNKNOWN; continue; }
      if (!q.options.some((o) => o.value === v)) { errors[q.id] = "Choose one of the listed options."; continue; }
      values[q.id] = v;
    }
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}

/**
 * Turn validated answers into 0-5 weights. Every weight starts at baseWeight and
 * each answer adds its documented deltas. `trace` records why each weight moved.
 */
export function deriveWeights(values, rules, criteria) {
  const raw = Object.fromEntries(criteria.map((c) => [c.id, rules.baseWeight]));
  const trace = Object.fromEntries(criteria.map((c) => [c.id, []]));
  for (const q of rules.questions) {
    if (q.type !== "choice") continue;
    const opt = q.options.find((o) => o.value === values[q.id]);
    if (!opt) continue;
    for (const [cid, d] of Object.entries(opt.deltas || {})) {
      if (!(cid in raw) || !d) continue;
      raw[cid] += d;
      trace[cid].push({ question: q.label, answer: opt.label, delta: d });
    }
  }
  const weights = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, clampWeight(v)]));
  return { weights, trace };
}

/** Number of questions answered "unknown". */
export function countUnknowns(values, rules) {
  return rules.questions.filter((q) => q.type === "choice" && values[q.id] === UNKNOWN).length;
}

/** Links needed to fully connect n nodes. */
export const fullMeshLinks = (n) => (n * (n - 1)) / 2;
