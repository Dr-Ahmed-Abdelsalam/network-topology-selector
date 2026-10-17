// Data loading and integrity checks.

/** Returns a list of problems; an empty list means the data is consistent. */
export function validateData(data, rules) {
  const errs = [];
  if (!data || data.schemaVersion !== 2) errs.push("topologies.json: schemaVersion must be 2");
  const crit = data?.criteria || [];
  if (crit.length !== 8) errs.push(`expected 8 criteria, found ${crit.length}`);
  const cids = new Set();
  crit.forEach((c) => {
    if (cids.has(c.id)) errs.push(`duplicate criterion id ${c.id}`);
    cids.add(c.id);
    if (!c.rubric || !c.rubric[1] || !c.rubric[5] || !c.rubric[10]) errs.push(`criterion ${c.id}: rubric needs anchors 1, 5 and 10`);
  });
  const refIds = new Set((data?.references || []).map((r) => r.id));
  if (refIds.size !== (data?.references || []).length) errs.push("duplicate reference ids");
  (data?.references || []).forEach((r) => {
    if (!/^https:\/\//.test(r.url || "")) errs.push(`reference ${r.id}: url must be https`);
    if (!["verified", "weak", "unverified", "unsupported"].includes(r.status)) errs.push(`reference ${r.id}: invalid status`);
    if (r.pages && r.status !== "verified") errs.push(`reference ${r.id}: page numbers recorded on an unverified source`);
  });
  const tids = new Set();
  (data?.topologies || []).forEach((t) => {
    if (tids.has(t.id)) errs.push(`duplicate topology id ${t.id}`);
    tids.add(t.id);
    if (!Array.isArray(t.baselineScores) || t.baselineScores.length !== crit.length) errs.push(`${t.id}: needs ${crit.length} baseline scores`);
    (t.baselineScores || []).forEach((s, i) => { if (!Number.isInteger(s) || s < 1 || s > 10) errs.push(`${t.id}: score ${i} out of range`); });
    if (!Array.isArray(t.justification) || t.justification.length !== crit.length) errs.push(`${t.id}: needs ${crit.length} justifications`);
    [...(t.refs || []), ...(t.justification || []).flatMap((j) => j.refs || [])].forEach((r) => { if (!refIds.has(r)) errs.push(`${t.id}: unknown reference ${r}`); });
    if (!["physical", "logical-mac", "special-case"].includes(t.category)) errs.push(`${t.id}: invalid category`);
    if (!["current", "niche", "legacy"].includes(t.status)) errs.push(`${t.id}: invalid status`);
    if (t.specialCaseOf && !(data.topologies || []).some((x) => x.id === t.specialCaseOf)) errs.push(`${t.id}: specialCaseOf points to unknown topology`);
  });
  if (rules) {
    (rules.questions || []).forEach((q) => (q.options || []).forEach((o) => Object.keys(o.deltas || {}).forEach((k) => { if (!cids.has(k)) errs.push(`rules ${q.id}/${o.value}: unknown criterion ${k}`); })));
  }
  return errs;
}

export async function loadData(base = "") {
  const get = async (p) => { const r = await fetch(base + p); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
  const [data, rules] = await Promise.all([get("data/topologies.json"), get("data/rules.json")]);
  const errs = validateData(data, rules);
  if (errs.length) throw new Error("Data check failed: " + errs.join("; "));
  return { data, rules };
}
