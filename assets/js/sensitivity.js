// Sensitivity analysis: does the recommendation survive modest changes in weights?
import { rank, topEligible, clampWeight } from "./scoring.js";

/** Small deterministic PRNG so results (and tests) are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const winnerOf = (topologies, weights, criteria, isEligible) => {
  const top = topEligible(rank(topologies, weights, criteria), isEligible);
  return top ? top.id : null;
};

/**
 * One-at-a-time test: raise and lower each weight by `step` (within 0-5).
 * Returns every change that alters the eligible winner.
 */
export function oneAtATime(topologies, weights, criteria, isEligible = () => true, step = 1) {
  const base = winnerOf(topologies, weights, criteria, isEligible);
  const flips = [];
  for (const c of criteria) {
    for (const d of [step, -step]) {
      const to = clampWeight(weights[c.id] + d);
      if (to === weights[c.id]) continue;
      const w = { ...weights, [c.id]: to };
      const win = winnerOf(topologies, w, criteria, isEligible);
      if (win && win !== base) flips.push({ criterion: c.id, name: c.name, from: weights[c.id], to, winner: win });
    }
  }
  return { base, flips };
}

/**
 * Random perturbation: multiply every weight by a factor in [1-spread, 1+spread]
 * (continuous, not rounded) and count how often the winner stays the same.
 */
export function stability(topologies, weights, criteria, isEligible = () => true, { samples = 500, spread = 0.25, seed = 42 } = {}) {
  const base = winnerOf(topologies, weights, criteria, isEligible);
  const rnd = mulberry32(seed);
  const winners = {};
  let same = 0;
  for (let i = 0; i < samples; i++) {
    const arr = criteria.map((c) => weights[c.id] * (1 - spread + 2 * spread * rnd()));
    const sum = arr.reduce((a, b) => a + b, 0);
    if (!sum) continue;
    let best = null;
    topologies.forEach((t) => {
      if (!isEligible(t.id)) return;
      const s = arr.reduce((acc, w, k) => acc + w * t.baselineScores[k], 0) / sum;
      if (!best || s > best.s + 1e-12) best = { id: t.id, s };
    });
    if (!best) continue;
    winners[best.id] = (winners[best.id] || 0) + 1;
    if (best.id === base) same++;
  }
  return { base, share: samples ? same / samples : 0, winners, samples, spread };
}

/**
 * For each eligible alternative, the smallest single-weight change (within 0-5)
 * that would make it the winner. Alternatives that cannot win this way are omitted.
 */
export function overtakeConditions(topologies, weights, criteria, isEligible = () => true) {
  const base = winnerOf(topologies, weights, criteria, isEligible);
  const out = [];
  for (const t of topologies) {
    if (t.id === base || !isEligible(t.id)) continue;
    let best = null;
    for (const c of criteria) {
      for (let to = 0; to <= 5; to++) {
        if (to === weights[c.id]) continue;
        const w = { ...weights, [c.id]: to };
        if (winnerOf(topologies, w, criteria, isEligible) === t.id) {
          const dist = Math.abs(to - weights[c.id]);
          if (!best || dist < best.dist) best = { id: t.id, name: t.name, criterion: c.id, criterionName: c.name, from: weights[c.id], to, dist };
        }
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.dist - b.dist);
}
