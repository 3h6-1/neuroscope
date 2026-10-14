/**
 * Human PET topographies are evidence for spatial variation, not measured
 * drug-induced neural gain. Each normalized weight remains a model proxy.
 * See docs/research-regional.md for mapping choices and data licensing.
 */
import atlas from '../public/data/regional-receptors.json' with { type: 'json' };

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const REGIONAL_ATLAS = freeze(atlas);

// Anatomical-name correspondences, NOT nearest-neighbour sampling of the
// rendered brain's schematic coordinates. Equal parcel averaging is estimated.
export const REGIONAL_PARCEL_MAPPING = freeze({
  dlpfc: { labels: ['rostralmiddlefrontal', 'caudalmiddlefrontal'], note: 'Middle frontal gyri approximate dorsolateral prefrontal territory; parcel means are equally weighted.' },
  vmpfc: { labels: ['medialorbitofrontal'], note: 'Medial orbitofrontal cortex is an anatomical proxy for the broader ventromedial prefrontal node.' },
  ofc: { labels: ['lateralorbitofrontal'], note: 'Lateral orbitofrontal parcel represents this node; medial orbitofrontal is assigned to the ventromedial node.' },
  acc: { labels: ['rostralanteriorcingulate', 'caudalanteriorcingulate'], note: 'Rostral and caudal anterior cingulate parcel means are equally weighted.' },
  pcc: { labels: ['posteriorcingulate'], note: 'Posterior cingulate anatomical parcel; the node is not a registered atlas mesh.' },
  precuneus: { labels: ['precuneus'], note: 'Whole anatomical precuneus parcel, not a functionally isolated subterritory.' },
  ipl: { labels: ['inferiorparietal'], note: 'Inferior parietal anatomical parcel approximates the association node.' },
  ifg: { labels: ['parsopercularis', 'parstriangularis', 'parsorbitalis'], note: 'Three inferior frontal subdivisions are averaged equally, without estimating their volumes.' },
  temporal: { labels: ['middletemporal', 'inferiortemporal'], note: 'Middle and inferior temporal parcels approximate the lateral association node; no primary auditory parcel is sampled.' },
  hippocampus: { labels: ['hippocampus'], note: 'Whole hippocampus, without hippocampal subfields or layer specificity.' },
  amygdala: { labels: ['amygdala'], note: 'Whole amygdala, without nucleus or cell-type specificity.' },
  striatum: { labels: ['caudate'], note: 'Whole caudate is a proxy for associative striatum; the atlas does not isolate its associative territory.' },
});

export const REGIONAL_MODEL_LIMITATION = 'PET measures regional binding availability, not drug-induced firing. Anatomical mapping, normalization, receptor-to-population gain/sign, connectivity and cognitive effects remain model estimates.';

const FALLBACK_REASONS = freeze({
  NET: 'Available [11C]MRB atlas parcels include low/negative BP_ND; no validated spatial gain calibration is substituted.',
  NMDA: 'No validated NMDA spatial gain calibration is imported; tracer availability is not automatically total NMDA density.',
  ADENOSINE: 'No matching adenosine receptor atlas is imported for this lumped target.',
  NACHR: 'The model pools nicotinic receptors; a subtype-specific α4β2 map is not treated as total nicotinic density.',
});

const uncoveredReason = base => ({
  md_thalamus: 'The atlas contains whole thalamus, which does not isolate the mediodorsal nucleus.',
  cerebellum: 'The atlas does not resolve the model’s cognitive cerebellar territory.',
  raphe: 'The atlas does not resolve dorsal raphe; a whole-brainstem signal is not substituted.',
  lc: 'The atlas does not resolve locus coeruleus; a whole-brainstem signal is not substituted.',
}[base] || 'No anatomically supported parcel correspondence is defined.');

export function regionalSensitivity(regionId, fallbackWeights) {
  if (typeof regionId !== 'string' || !fallbackWeights || typeof fallbackWeights !== 'object' || Array.isArray(fallbackWeights)) throw new TypeError('Invalid regional sensitivity input');
  const match = regionId.match(/^(.*)_([lr])$/);
  const base = match ? match[1] : regionId;
  const hemisphere = match?.[2].toUpperCase();
  const mapping = hemisphere ? REGIONAL_PARCEL_MAPPING[base] : undefined;
  const parcels = mapping ? mapping.labels.map(label => REGIONAL_ATLAS.parcels.find(parcel => parcel.label === label && parcel.hemisphere === hemisphere)) : [];
  if (parcels.some(parcel => !parcel)) throw new Error(`Unresolved atlas mapping for ${regionId}`);
  const weights = {};
  const evidenceByTarget = {};
  for (const [target, fallback] of Object.entries(fallbackWeights)) {
    if (!Number.isFinite(fallback) || fallback < 0) throw new RangeError(`Invalid fallback sensitivity for ${target}`);
    const source = REGIONAL_ATLAS.maps[target];
    let reason = !mapping ? uncoveredReason(base) : FALLBACK_REASONS[target];
    if (mapping && source?.coverage === 'extrastriatal' && base === 'striatum') reason = 'The imported D2/3 PET protocol targets extrastriatal binding; striatal D2 sensitivity remains estimated.';
    if (mapping && source?.coverage === 'striatal' && base !== 'striatum') reason = 'Only striatal DAT binding is used; low/negative extrastriatal PET values are not converted into density.';
    if (!source && !reason) reason = 'No quantitative spatial reference is imported for this target.';
    if (reason) {
      weights[target] = fallback;
      evidenceByTarget[target] = { type: 'estimated', classification: 'Estimated sensitivity', weight: fallback, atlasRegions: [], limitations: [reason, REGIONAL_MODEL_LIMITATION] };
      continue;
    }
    const rawValue = parcels.reduce((sum, parcel) => sum + source.values[parcel.index], 0) / parcels.length;
    if (!(rawValue >= 0) || !(source.normalizationMean > 0)) throw new RangeError(`Invalid PET normalization for ${regionId}/${target}`);
    const weight = rawValue / source.normalizationMean;
    weights[target] = weight;
    evidenceByTarget[target] = {
      type: 'pet-derived', classification: 'Human PET-derived spatial proxy', weight,
      sourceId: source.sourceId, sourceTitle: source.sourceTitle, sourceUrl: source.sourceUrl,
      dataUrl: source.dataUrl, tracer: source.tracer, sampleSize: source.sampleSize,
      parameter: source.parameter, rawValue, rawUnits: source.rawUnits,
      atlasRegions: parcels.map(parcel => ({ ...parcel, value: source.values[parcel.index] })),
      normalization: {
        formula: 'mean(mapped parcel values) / mean(reference parcel values)',
        denominator: source.normalizationMean,
        reference: source.normalizationSet === 'cortex' ? 'All 68 bilateral cortical atlas parcels (equal parcel weighting)' : 'Bilateral caudate and putamen (4 parcels; equal parcel weighting)',
        referenceIndices: source.normalizationReference,
        estimated: true,
      },
      mappingNote: mapping.note,
      limitations: [...source.limitations, 'Normalization and proportional conversion from binding to sensitivity are modeling choices; there is no fitted firing-effect coefficient.', REGIONAL_MODEL_LIMITATION],
    };
  }
  const measured = Object.values(evidenceByTarget).filter(entry => entry.type === 'pet-derived').length;
  return freeze({
    weights, evidenceByTarget,
    summary: `${measured}/${Object.keys(weights).length} regional weights use human PET spatial proxies; remaining weights estimated. All receptor-to-network effects remain estimated.`,
  });
}
