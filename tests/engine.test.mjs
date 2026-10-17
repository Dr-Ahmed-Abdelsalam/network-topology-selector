// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { weightedScore, normalizeWeights, rank, clampWeight, nearTies, topEligible } from "../assets/js/scoring.js";
import { validateInputs, deriveWeights, countUnknowns, fullMeshLinks } from "../assets/js/requirements.js";
import { assessScenario } from "../assets/js/scenario.js";
import { oneAtATime, stability, overtakeConditions, mulberry32 } from "../assets/js/sensitivity.js";
import { encodeState, decodeState } from "../assets/js/state.js";
import { validateData } from "../assets/js/data.js";
import { diagram, hasDiagram } from "../assets/js/diagrams.js";

const data = JSON.parse(readFileSync(new URL("../data/topologies.json", import.meta.url)));
const rules = JSON.parse(readFileSync(new URL("../data/rules.json", import.meta.url)));
const C = data.criteria;
const T = data.topologies;
const equal = Object.fromEntries(C.map((c) => [c.id, 3]));
const byId = (id) => T.find((t) => t.id === id);

// ---------- weighted scoring ----------
test("weighted score with equal weights equals the plain mean", () => {
  for (const t of T) {
    const mean = t.baselineScores.reduce((a, b) => a + b, 0) / C.length;
    assert.ok(Math.abs(weightedScore(t.baselineScores, equal, C) - mean) < 1e-12);
  }
});

test("weighted score matches a hand calculation", () => {
  const w = { ...Object.fromEntries(C.map((c) => [c.id, 0])), cost: 5, security: 1 };
  // Bus: cost 9, security 3 -> (5*9 + 1*3) / 6 = 8
  assert.equal(weightedScore(byId("bus").baselineScores, w, C), 8);
});

test("a single non-zero weight ranks by that criterion alone", () => {
  const w = { ...Object.fromEntries(C.map((c) => [c.id, 0])), cost: 4 };
  const r = rank(T, w, C);
  assert.equal(r[0].id, "bus"); // cost 9 (tie with none)
  assert.equal(r[r.length - 1].id, "full"); // cost 1
});

// ---------- zero weights ----------
test("all-zero weights give no score and an empty ranking", () => {
  const zero = Object.fromEntries(C.map((c) => [c.id, 0]));
  assert.equal(weightedScore(byId("star").baselineScores, zero, C), null);
  assert.deepEqual(rank(T, zero, C), []);
  assert.ok(Object.values(normalizeWeights(zero, C)).every((v) => v === 0));
});

test("missing weights are treated as zero", () => {
  assert.equal(weightedScore(byId("star").baselineScores, { delay: 2 }, C), 8);
});

// ---------- normalization ----------
test("normalized weights sum to 1 and preserve proportions", () => {
  const w = { architecture: 1, delay: 2, complexity: 3, security: 4, congestion: 5, routing: 0, reliability: 1, cost: 2 };
  const n = normalizeWeights(w, C);
  assert.ok(Math.abs(Object.values(n).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(Math.abs(n.congestion / n.architecture - 5) < 1e-12);
});

test("scaling all weights by the same factor does not change scores", () => {
  const a = { architecture: 1, delay: 2, complexity: 1, security: 2, congestion: 1, routing: 2, reliability: 1, cost: 2 };
  const b = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v * 2]));
  for (const t of T) assert.ok(Math.abs(weightedScore(t.baselineScores, a, C) - weightedScore(t.baselineScores, b, C)) < 1e-12);
});

test("weights are clamped to 0-5 integers", () => {
  assert.equal(clampWeight(7), 5);
  assert.equal(clampWeight(-2), 0);
  assert.equal(clampWeight(2.6), 3);
  assert.equal(clampWeight("x"), 0);
});

// ---------- ranking consistency ----------
test("ranking is sorted, complete and deterministic", () => {
  const r1 = rank(T, equal, C), r2 = rank(T, equal, C);
  assert.equal(r1.length, T.length);
  assert.deepEqual(r1.map((r) => r.id), r2.map((r) => r.id));
  for (let i = 1; i < r1.length; i++) assert.ok(r1[i - 1].score >= r1[i].score);
});

test("equal weights reproduce the baseline totals ranking (Star 58 first, Bus 41 last)", () => {
  const r = rank(T, equal, C);
  assert.equal(r[0].id, "star");
  assert.equal(r[r.length - 1].id, "bus");
});

test("ties keep data order", () => {
  const twins = [{ id: "a", name: "A", baselineScores: Array(8).fill(5) }, { id: "b", name: "B", baselineScores: Array(8).fill(5) }];
  assert.deepEqual(rank(twins, equal, C).map((r) => r.id), ["a", "b"]);
});

test("topEligible skips ineligible options and nearTies respects the threshold", () => {
  const r = rank(T, equal, C);
  assert.equal(topEligible(r, (id) => id !== "star").id, "full");
  const ties = nearTies(r, "star", 0.3);
  assert.ok(ties.every((x) => r[0].score - x.score <= 0.3 + 1e-9));
});

// ---------- input validation ----------
test("valid inputs pass and missing choices become 'unknown'", () => {
  const v = validateInputs({ devices: "40", org: "small_business" }, rules);
  assert.equal(v.valid, true);
  assert.equal(v.values.devices, 40);
  assert.equal(v.values.budget, "unknown");
});

test("device count is required, numeric and bounded", () => {
  assert.equal(validateInputs({}, rules).valid, false);
  assert.ok(validateInputs({ devices: "abc" }, rules).errors.devices);
  assert.ok(validateInputs({ devices: "1" }, rules).errors.devices);
  assert.ok(validateInputs({ devices: "3.5" }, rules).errors.devices);
  assert.ok(validateInputs({ devices: "1000001" }, rules).errors.devices);
  assert.equal(validateInputs({ devices: "100000" }, rules).valid, true);
});

test("unknown option values are rejected", () => {
  const v = validateInputs({ devices: "10", org: "spaceship" }, rules);
  assert.equal(v.valid, false);
  assert.ok(v.errors.org);
});

test("requirements map to documented weights with a trace", () => {
  const { values } = validateInputs({ devices: "20", budget: "limited", security: "regulated" }, rules);
  const { weights, trace } = deriveWeights(values, rules, C);
  assert.equal(weights.cost, 5);
  assert.equal(weights.complexity, 4);
  assert.equal(weights.security, 5);
  assert.equal(weights.delay, 3);
  assert.equal(trace.cost.length, 1);
  assert.equal(trace.cost[0].delta, 2);
});

test("derived weights are always clamped to 0-5", () => {
  const { values } = validateInputs({ devices: "10", org: "data_center", traffic: "heavy", latency: "real_time", budget: "generous", reliability: "mission_critical" }, rules);
  const { weights } = deriveWeights(values, rules, C);
  Object.values(weights).forEach((w) => assert.ok(w >= 0 && w <= 5));
  assert.equal(weights.congestion, 5); // 3+1+2+1 = 7 -> 5
  assert.equal(weights.cost, 1);
});

test("unknowns are counted", () => {
  const { values } = validateInputs({ devices: "10" }, rules);
  assert.equal(countUnknowns(values, rules), rules.questions.filter((q) => q.type === "choice").length);
});

// ---------- scenario ----------
test("legacy options are never recommended", () => {
  const { values } = validateInputs({ devices: "10", budget: "limited" }, rules);
  const s = assessScenario(values, data, rules);
  assert.equal(s.eligibility.bus.eligible, false);
  assert.equal(s.eligibility["token-ring"].eligible, false);
  assert.equal(s.eligibility.star.eligible, true);
});

test("full mesh is ruled out above the node limit and the link count is reported", () => {
  const { values } = validateInputs({ devices: "120" }, rules);
  const s = assessScenario(values, data, rules);
  assert.equal(s.eligibility.full.eligible, false);
  assert.match(s.eligibility.full.reasons.join(" "), /7,140 links/);
  assert.equal(fullMeshLinks(120), 7140);
});

test("no redundancy rules out mesh options", () => {
  const { values } = validateInputs({ devices: "6", redundancy: "no" }, rules);
  const s = assessScenario(values, data, rules);
  assert.equal(s.eligibility.mesh.eligible, false);
  assert.equal(s.eligibility.full.eligible, false);
});

test("large or multi-site networks get a hybrid architecture", () => {
  const { values } = validateInputs({ devices: "400", scope: "campus", reliability: "high", redundancy: "yes" }, rules);
  const s = assessScenario(values, data, rules);
  assert.ok(s.hybrid);
  assert.equal(s.hybrid.layers[1].topology, "Partial mesh");
  const small = assessScenario(validateInputs({ devices: "12", scope: "room", org: "small_business" }, rules).values, data, rules);
  assert.equal(small.hybrid, null);
});

test("many unknown answers trigger a low-confidence warning", () => {
  const s = assessScenario(validateInputs({ devices: "30" }, rules).values, data, rules);
  assert.ok(s.warnings.some((w) => /Not sure/.test(w)));
});

// ---------- sensitivity ----------
test("PRNG is deterministic", () => {
  const a = mulberry32(7), b = mulberry32(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test("stability is reproducible and between 0 and 1", () => {
  const s1 = stability(T, equal, C), s2 = stability(T, equal, C);
  assert.equal(s1.share, s2.share);
  assert.ok(s1.share >= 0 && s1.share <= 1);
  assert.equal(s1.base, "star");
});

test("a dominant criterion makes the recommendation fully stable", () => {
  const w = { ...Object.fromEntries(C.map((c) => [c.id, 0])), delay: 5 };
  const s = stability(T, w, C);
  assert.equal(s.base, "full");
  assert.equal(s.share, 1);
});

test("one-at-a-time flips really change the winner", () => {
  const { base, flips } = oneAtATime(T, equal, C);
  for (const f of flips) {
    const w = { ...equal, [f.criterion]: f.to };
    assert.notEqual(rank(T, w, C)[0].id, base);
  }
});

test("overtake conditions are verified by re-ranking", () => {
  const conds = overtakeConditions(T, equal, C);
  assert.ok(conds.length > 0);
  for (const c of conds) {
    const w = { ...equal, [c.criterion]: c.to };
    assert.equal(rank(T, w, C)[0].id, c.id);
  }
});

// ---------- URL state ----------
test("state round-trips through the URL hash", () => {
  const st = { mode: "choose", inputs: { devices: "120", org: "enterprise", scope: "campus" }, weights: { ...equal, cost: 5 } };
  const back = decodeState(encodeState(st, C), C, rules);
  assert.equal(back.mode, "choose");
  assert.deepEqual(back.inputs, st.inputs);
  assert.deepEqual(back.weights, st.weights);
});

test("legacy v1 links (#w=XXXXXXXX) still restore weights", () => {
  const back = decodeState("#w=12345012", C, rules);
  assert.equal(back.legacy, true);
  assert.equal(back.mode, "compare");
  assert.equal(back.weights.architecture, 1);
  assert.equal(back.weights.cost, 2);
});

test("malformed hashes never throw and fall back safely", () => {
  for (const h of ["", "#", "#w=99999999", "#w=123", "#mode=hack&w=11111111", "#%E0%A4%A", "#devices=<script>"]) {
    const s = decodeState(h, C, rules);
    assert.ok(["compare", "choose", "method"].includes(s.mode));
  }
  assert.equal(decodeState("#w=99999999", C, rules).weights, null);
  assert.equal(decodeState("#foo=1&org=enterprise", C, rules).inputs.foo, undefined);
});

// ---------- data integrity ----------
test("data files pass every integrity check", () => {
  assert.deepEqual(validateData(data, rules), []);
});

test("published baseline totals are unchanged", () => {
  const expected = { bus: 41, star: 58, ring: 43, "token-ring": 48, tree: 49, mesh: 56, full: 57 };
  for (const t of T) assert.equal(t.baselineScores.reduce((a, b) => a + b, 0), expected[t.id], t.id);
});

test("page numbers appear only on verified references", () => {
  data.references.filter((r) => r.pages).forEach((r) => assert.equal(r.status, "verified"));
});

test("integrity check catches broken data", () => {
  const bad = structuredClone(data);
  bad.topologies[0].baselineScores[0] = 11;
  bad.topologies[1].justification[0].refs = [99];
  const errs = validateData(bad, rules);
  assert.ok(errs.some((e) => /out of range/.test(e)));
  assert.ok(errs.some((e) => /unknown reference 99/.test(e)));
});

test("every topology has a diagram; unknown ids do not fake one", () => {
  T.forEach((t) => assert.ok(hasDiagram(t.id), t.id));
  assert.match(diagram("nope"), /No diagram/);
});
