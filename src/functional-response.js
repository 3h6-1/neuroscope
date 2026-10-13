/**
 * Experimental concentration–response endpoints, kept separate from binding.
 * A measured EC50/IC50 is never substituted for a Ki/Kd. Hill interpolation,
 * transfer from assay bath to modeled brain concentration, baseline activity
 * and the pooling of different assays into a mixture remain approximations.
 */
const kinds = {
  activation: ['agonist', 'partial_agonist'],
  uptake_inhibition: ['inhibitor'],
  potentiation: ['pam'],
  channel_inhibition: ['channel_blocker'],
};

export function validateFunctionalAssay(assay, action) {
  if (!assay || typeof assay !== 'object' || Array.isArray(assay)) throw new TypeError('Functional assay must be an object');
  if (!kinds[assay.kind]?.includes(action)) throw new TypeError('Functional assay endpoint does not match the target action');
  const expected = ['uptake_inhibition', 'channel_inhibition'].includes(assay.kind) ? 'IC50' : 'EC50';
  if (assay.midpointType !== expected) throw new TypeError(`Functional assay requires ${expected}, not a binding affinity`);
  if (!Number.isFinite(assay.midpointNM) || assay.midpointNM <= 0) throw new RangeError('Functional midpoint must be positive nM');
  if (!Number.isFinite(assay.hillSlope) || assay.hillSlope <= 0 || assay.hillSlope > 10) throw new RangeError('Functional Hill slope must be in (0, 10]');
  if (!Number.isFinite(assay.maxResponse) || assay.maxResponse < 0 || assay.maxResponse > (assay.kind === 'potentiation' ? 20 : 1)) throw new RangeError('Invalid functional response maximum');
  for (const key of ['endpoint', 'system', 'species', 'reference', 'hillEvidence', 'maxResponseEvidence']) {
    if (typeof assay[key] !== 'string' || !assay[key].trim()) throw new TypeError(`Functional assay needs ${key} provenance`);
  }
  if (!Array.isArray(assay.sourceIds) || !assay.sourceIds.length || assay.sourceIds.some(id => typeof id !== 'string' || !id.trim())) throw new TypeError('Functional assay requires source references');
  return assay;
}

export function functionalWeight(concentrationNM, assay) {
  if (!Number.isFinite(concentrationNM) || concentrationNM < 0) throw new RangeError('Assay concentration must be nonnegative and finite');
  if (concentrationNM === 0) return 0;
  // Keep extreme user-supplied concentrations finite in mixture denominators.
  return Math.exp(Math.min(230, assay.hillSlope * (Math.log(concentrationNM) - Math.log(assay.midpointNM))));
}

export function functionalResponse(concentrationNM, assay) {
  const weight = functionalWeight(concentrationNM, assay);
  return assay.maxResponse * (weight / (1 + weight));
}

/** An estimated mixture rule; this is not a fit to combination experiments. */
export function responsePool(candidates, fallbackMaximum, fallbackWeight = candidate => candidate.weight) {
  let totalWeight = 0, weightedResponse = 0;
  for (const candidate of candidates) {
    const weight = candidate.functionalAssay ? functionalWeight(candidate.concentrationNM, candidate.functionalAssay) : fallbackWeight(candidate);
    const maximum = candidate.functionalAssay?.maxResponse ?? fallbackMaximum(candidate);
    totalWeight += weight;
    weightedResponse += weight * maximum;
  }
  return { denominator: 1 + totalWeight, weightedResponse };
}
