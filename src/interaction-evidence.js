/**
 * Limited mechanistic-static CYP model, evaluated at each PK step.
 * Measured Ki values are distinct from derived fm estimates. Human trial
 * results remain references and are never applied as mixture AUC multipliers.
 */
import evidence from '../public/data/interaction-evidence.json' with { type: 'json' };

const clone = value => structuredClone(value);
const positive = (value, name) => {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`);
  return value;
};
const unitFraction = (value, name) => {
  positive(value, name);
  if (value > 1) throw new RangeError(`${name} must not exceed one`);
  return value;
};

export function clearanceFractionFromAUCR(ratio) {
  positive(ratio, 'AUC ratio');
  if (ratio < 1) throw new RangeError('Inhibition-derived AUC ratio must be at least one');
  return 1 - 1 / ratio;
}

export function validateInteractionEvidence(data) {
  if (data?.schemaVersion !== 1) throw new TypeError('Unsupported interaction evidence schema');
  for (const field of ['sources', 'inhibitionAssays', 'clearanceModels', 'clinicalReferences', 'limitations']) {
    if (!Array.isArray(data[field])) throw new TypeError(`Missing interaction evidence ${field}`);
  }
  const sourceIds = new Set(data.sources.map(s => s.id));
  if (sourceIds.size !== data.sources.length) throw new TypeError('Duplicate interaction source');
  for (const s of data.sources) if (!s.id || !s.title || !/^https:\/\//.test(s.url)) throw new TypeError('Interaction sources require HTTPS provenance');
  const ids = new Set();
  for (const row of [...data.inhibitionAssays, ...data.clearanceModels, ...data.clinicalReferences]) {
    if (!row.id || ids.has(row.id)) throw new TypeError('Missing or duplicate interaction evidence id');
    ids.add(row.id);
    if (!Array.isArray(row.sourceIds) || !row.sourceIds.length || row.sourceIds.some(id => !sourceIds.has(id))) throw new TypeError('Interaction evidence refers to missing sources');
  }
  for (const assay of data.inhibitionAssays) {
    if (!assay.compoundId || !assay.enzyme || !assay.system || !assay.species || !assay.assumptions?.length) throw new TypeError('Inhibitor assay requires context and assumptions');
    if (!assay.components?.length) throw new TypeError('Inhibitor assay requires components');
    let total = 0;
    for (const c of assay.components) {
      positive(c.kiNM, 'Ki'); unitFraction(c.microsomalUnboundFraction, 'microsomal unbound fraction'); unitFraction(c.parentFraction, 'parent fraction');
      if (!c.bindingEvidence || !c.fractionEvidence) throw new TypeError('Concentration conversions require provenance');
      total += c.parentFraction;
    }
    if (Math.abs(total - 1) > 1e-10) throw new RangeError('Parent component fractions must sum to one');
  }
  const fractionsByCompound = new Map();
  for (const row of data.clearanceModels) {
    clearanceFractionFromAUCR(row.observedAUCR);
    if (!row.compoundId || !row.enzyme || !row.assumptions?.length) throw new TypeError('Clearance derivation requires context and assumptions');
    if (row.observedAUCR90CI && (row.observedAUCR90CI.length !== 2 || row.observedAUCR90CI[0] > row.observedAUCR || row.observedAUCR90CI[1] < row.observedAUCR)) throw new RangeError('Invalid AUC ratio interval');
    const total = (fractionsByCompound.get(row.compoundId) || 0) + clearanceFractionFromAUCR(row.observedAUCR);
    if (total > 1) throw new RangeError('Clearance fractions must not exceed total clearance');
    fractionsByCompound.set(row.compoundId, total);
  }
  for (const row of data.clinicalReferences) {
    if (!row.compoundIds?.length || !row.triggerCompoundIds?.length || !row.title || !row.result || !row.regimen || !row.population || !row.applicability) throw new TypeError('Clinical reference requires population, regimen, endpoint and applicability');
    if (row.observedAUCR != null) positive(row.observedAUCR, 'Observed AUC ratio');
  }
  return data;
}

validateInteractionEvidence(evidence);
const sourcesFor = ids => evidence.sources.filter(s => ids.includes(s.id));
const withSources = row => ({ ...clone(row), sources: clone(sourcesFor(row.sourceIds)) });
const derivedModel = row => ({ ...withSources(row), fraction: clearanceFractionFromAUCR(row.observedAUCR),
  ...(row.observedAUCR90CI ? { derivedFractionStudyInterval: row.observedAUCR90CI.map(clearanceFractionFromAUCR) } : {}) });
const enzymeName = value => String(typeof value === 'string' ? value : value.enzyme).toUpperCase();
const curated = profile => Boolean(profile && !profile.custom && profile.metabolism?.interactionEvidenceId === profile.id);
const asMap = compounds => compounds instanceof Map ? compounds : new Map((Array.isArray(compounds) ? compounds : compounds?.compounds || []).map(p => [p.id, p]));

/** Read-only inspector data; no assay is attached to a custom profile by ID. */
export function interactionProfileEvidence(profileOrId) {
  const id = typeof profileOrId === 'string' ? profileOrId : curated(profileOrId) ? profileOrId.id : null;
  const inhibitionAssays = evidence.inhibitionAssays.filter(row => row.compoundId === id).map(withSources);
  const clearanceModels = evidence.clearanceModels.filter(row => row.compoundId === id).map(derivedModel);
  const clinicalReferences = evidence.clinicalReferences.filter(row => row.compoundIds.includes(id)).map(withSources);
  const sourceIds = [...new Set([...inhibitionAssays, ...clearanceModels, ...clinicalReferences].flatMap(row => row.sourceIds))];
  return { inhibitionAssays, clearanceModels, clinicalReferences, sources: clone(sourcesFor(sourceIds)), limitations: [...evidence.limitations] };
}

/** Sum unbound inhibitor / unbound Ki. Nominal assay Ki is corrected by fu,mic. */
export function inhibitionWeight(freeParentNM, assay) {
  if (!Number.isFinite(freeParentNM) || freeParentNM < 0) throw new RangeError('Free parent concentration must be nonnegative and finite');
  return assay.components.reduce((total, c) => total + freeParentNM * unitFraction(c.parentFraction, 'parent fraction') / (positive(c.kiNM, 'Ki') * unitFraction(c.microsomalUnboundFraction, 'microsomal unbound fraction')), 0);
}

/** Static competitive inhibition; fm is a specified study/model estimate. */
export function staticClearanceFactor(fractionMetabolized, weight) {
  if (!Number.isFinite(fractionMetabolized) || fractionMetabolized < 0 || fractionMetabolized > 1) throw new RangeError('Clearance fraction must be between zero and one');
  if (!Number.isFinite(weight) || weight < 0) throw new RangeError('Inhibition weight must be finite and nonnegative');
  return 1 - fractionMetabolized + fractionMetabolized / (1 + weight);
}

/**
 * Only curated parent assays + a substrate-specific derived fraction change
 * elimination. Unknown fractions/potencies produce explicit unresolved rows.
 * Self-inhibition is omitted, never double-counted atop the clinical half-life.
 */
export function computeMetabolicInteractions(exposures, compounds, { includeEvidence = true } = {}) {
  const profiles = asMap(compounds);
  const active = exposures.filter(e => e.active !== false && profiles.has(e.id));
  const factors = Object.fromEntries(active.map(e => [e.id, 1]));
  const interactions = [];
  const inhibitors = active.flatMap(exposure => {
    const profile = profiles.get(exposure.id);
    const freeNM = exposure.freePlasmaNM ?? (exposure.plasmaNM ?? 0) * (profile.pk?.freeFraction ?? 0);
    if (!Number.isFinite(freeNM) || freeNM < 0) throw new RangeError('Free inhibitor concentration must be nonnegative and finite');
    if (freeNM === 0) return [];
    return (profile.metabolism?.inhibits || []).map(enzyme => ({ id: exposure.id, enzyme: enzymeName(enzyme), freeNM,
      assay: curated(profile) ? evidence.inhibitionAssays.find(a => a.compoundId === exposure.id && a.enzyme === enzymeName(enzyme)) : null }));
  });
  for (const exposure of active) {
    const profile = profiles.get(exposure.id);
    for (const enzyme of new Set((profile.metabolism?.substrate || []).map(enzymeName))) {
      const relevant = inhibitors.filter(i => i.enzyme === enzyme && i.id !== exposure.id);
      if (!relevant.length) continue;
      const row = curated(profile) ? evidence.clearanceModels.find(m => m.compoundId === exposure.id && m.enzyme === enzyme) : null;
      const known = relevant.filter(i => i.assay), unknown = relevant.filter(i => !i.assay);
      const weight = known.reduce((sum, i) => sum + inhibitionWeight(i.freeNM, i.assay), 0);
      const modeled = Boolean(row && known.length);
      const fraction = modeled ? clearanceFractionFromAUCR(row.observedAUCR) : 0;
      const clearanceFactor = modeled ? staticClearanceFactor(fraction, weight) : null;
      // Multiple enzyme fractions are not independently multiplied: additional
      // pathways need a jointly validated total-clearance allocation first.
      if (modeled) factors[exposure.id] -= 1 - clearanceFactor;
      if (!includeEvidence) continue;
      const clearanceModel = row ? derivedModel(row) : null;
      const assays = known.map(i => ({ ...withSources(i.assay), freePlasmaNM: i.freeNM, inhibitionWeight: inhibitionWeight(i.freeNM, i.assay) }));
      const sourceIds = [...new Set([...assays.flatMap(a => a.sourceIds), ...(clearanceModel?.sourceIds || [])])];
      interactions.push({ substrateId: exposure.id, inhibitorIds: relevant.map(i => i.id), enzyme, modeled, clearanceFactor,
        evidenceType: modeled ? 'assay-informed estimate' : 'unmodeled',
        evidence: modeled
          ? 'In-vitro parent Ki measurements with a study-derived clearance fraction. Free plasma-to-liver transfer and mixture additivity remain estimates; metabolites and enzyme adaptation are omitted.'
          : 'A shared metabolic pathway is known, but a curated inhibition constant and substrate clearance fraction are not both available. No numeric clearance change is calculated.',
        partial: unknown.length > 0, unmodeledInhibitorIds: unknown.map(i => i.id),
        assays, clearanceModel, sources: clone(sourcesFor(sourceIds)),
      });
    }
  }
  if (!includeEvidence) return { factors, interactions: [], references: [], limitations: [] };
  const activeCurated = new Set(active.filter(e => curated(profiles.get(e.id))).map(e => e.id));
  const references = evidence.clinicalReferences.filter(row => row.triggerCompoundIds.every(id => activeCurated.has(id))).map(withSources);
  return { factors, interactions, references, limitations: [...evidence.limitations] };
}
