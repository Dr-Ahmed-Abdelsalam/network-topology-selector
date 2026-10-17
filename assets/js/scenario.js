// Scenario checks: which options are practical for these requirements, whether a
// hybrid architecture is needed, and what to warn about. Baseline scores are never changed.
import { UNKNOWN, countUnknowns, fullMeshLinks } from "./requirements.js";

const fmt = (n) => Number(n).toLocaleString("en");

export function assessScenario(values, data, rules) {
  const cfg = rules.scenario;
  const n = values.devices;
  const eligibility = {};
  const notes = [];
  const warnings = [];

  for (const t of data.topologies) {
    const reasons = [];
    if (t.status === "legacy") reasons.push(`${t.name} is a legacy technology and is not offered as a modern purchase option. It stays in the ranking for comparison.`);
    if (t.id === "full" && n > cfg.fullMeshMaxNodes) {
      reasons.push(`Fully connecting ${fmt(n)} devices would need ${fmt(fullMeshLinks(n))} links and ${fmt(n - 1)} ports per device. It is only practical for a few core nodes (up to about ${cfg.fullMeshMaxNodes}).`);
    }
    if ((t.id === "mesh" || t.id === "full") && values.redundancy === "no") {
      reasons.push(`${t.name} only delivers its reliability advantage with redundant links and equipment, which you said are not available.`);
    }
    eligibility[t.id] = { eligible: reasons.length === 0, reasons };
  }

  if (values.redundancy === UNKNOWN) warnings.push("Redundancy is unknown. Mesh options are scored as if backup links were installed; confirm this before relying on them.");
  const unknowns = countUnknowns(values, rules);
  if (unknowns >= cfg.lowConfidenceUnknowns) warnings.push(`${unknowns} questions were answered "Not sure". The recommendation rests on default weights for those criteria, so treat it as a starting point.`);
  if (values.org === "home" && n > 50) warnings.push("A home network with more than 50 devices is unusual; please check the device count.");

  const ring = data.topologies.find((t) => t.id === "ring");
  if (ring && ring.status === "niche") notes.push("Ring is mainly used today in protected metro or industrial rings, not in office LANs.");

  const hybridReasons = [];
  if (cfg.hybridScopes.includes(values.scope)) hybridReasons.push(values.scope === "distributed" ? "the network spans several sites" : "the network spans several buildings");
  if (n >= cfg.hybridMinDevices) hybridReasons.push(`${fmt(n)} devices are more than one access switch layer handles well`);
  if (cfg.hybridOrgs.includes(values.org)) hybridReasons.push("the organization type usually needs separate access and core layers");
  let hybrid = null;
  if (hybridReasons.length) {
    const redundantCore = values.redundancy !== "no" && (["high", "mission_critical"].includes(values.reliability) || ["critical", "data_center"].includes(values.org));
    const layers = [
      { layer: "Access", topology: "Star", detail: "each device connects to an access switch" },
      redundantCore
        ? { layer: "Core / distribution", topology: "Partial mesh", detail: "two core switches with dual-homed uplinks from every access switch" }
        : { layer: "Core / distribution", topology: "Tree", detail: "access switches aggregate to a core switch; add a second core and uplinks later for redundancy" },
    ];
    if (values.scope === "distributed") layers.push({ layer: "Between sites", topology: "Partial mesh", detail: "each site links to at least two others or to two hubs" });
    hybrid = {
      reasons: hybridReasons,
      layers,
      title: `Hierarchical hybrid: star access${redundantCore ? " with a redundant partial-mesh core" : " with a tree core"}`,
      refs: [9],
    };
  }

  return { eligibility, notes, warnings, hybrid, unknowns };
}

/** Design assumptions that apply to every recommendation, plus scenario-specific ones. */
export function assumptions(values, data) {
  const list = [
    "Star and Tree assume switches, not hubs.",
    "Mesh reliability assumes the redundant links and devices are installed and configured.",
    "Baseline scores do not change with network size; size is handled by the scenario checks.",
    "Budget is treated as a category; no prices are estimated.",
    "Security and congestion also depend on configuration (VLANs, access control, QoS), which is outside this model.",
  ];
  if (values.devices) list.push(`For reference: a full mesh of ${fmt(values.devices)} devices needs ${fmt(fullMeshLinks(values.devices))} links.`);
  return list;
}
