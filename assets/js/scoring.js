// Weighted Sum Model: pure functions, no DOM. S(t) = Σ w(c)·s(t,c) / Σ w(c)

export const W_MIN = 0;
export const W_MAX = 5;

/** Clamp a weight to the 0-5 integer range. Non-numbers become 0. */
export function clampWeight(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(W_MAX, Math.max(W_MIN, n));
}

/** Weights object -> array aligned with criteria order. Missing ids count as 0. */
export function weightsToArray(weights, criteria) {
  return criteria.map((c) => clampWeight(weights[c.id] ?? 0));
}

/** Normalized weights (fractions summing to 1). All-zero input returns all zeros. */
export function normalizeWeights(weights, criteria) {
  const arr = weightsToArray(weights, criteria);
  const sum = arr.reduce((a, b) => a + b, 0);
  return Object.fromEntries(criteria.map((c, i) => [c.id, sum ? arr[i] / sum : 0]));
}

/** Weighted score on the 1-10 scale, or null when every weight is zero. */
export function weightedScore(scores, weights, criteria) {
  const arr = weightsToArray(weights, criteria);
  const sum = arr.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  return arr.reduce((acc, w, i) => acc + w * scores[i], 0) / sum;
}

/**
 * Rank topologies by weighted score (descending). Ties keep data order, so the
 * ranking is deterministic. Returns [] when every weight is zero.
 */
export function rank(topologies, weights, criteria) {
  const rows = topologies.map((t, order) => ({ id: t.id, name: t.name, order, score: weightedScore(t.baselineScores, weights, criteria) }));
  if (rows.some((r) => r.score === null)) return [];
  return rows.sort((a, b) => b.score - a.score || a.order - b.order);
}

/** Best-ranked row whose id passes the filter (e.g. scenario eligibility). */
export function topEligible(ranked, isEligible = () => true) {
  return ranked.find((r) => isEligible(r.id)) || null;
}

/** Rows within `threshold` points of the leader (excluding the leader). */
export function nearTies(ranked, leaderId, threshold, isEligible = () => true) {
  const lead = ranked.find((r) => r.id === leaderId);
  if (!lead) return [];
  return ranked.filter((r) => r.id !== leaderId && isEligible(r.id) && lead.score - r.score <= threshold + 1e-9);
}

/** Per-criterion contribution of one topology: w·s/Σw, useful to explain a score. */
export function contributions(scores, weights, criteria) {
  const arr = weightsToArray(weights, criteria);
  const sum = arr.reduce((a, b) => a + b, 0);
  return criteria.map((c, i) => ({ id: c.id, name: c.name, weight: arr[i], score: scores[i], share: sum ? (arr[i] * scores[i]) / sum : 0 }));
}
