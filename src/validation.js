/** Reproducible endpoint comparisons. Observations are never fitted here. */
import pet from '../public/data/validation-pet.json' with { type: 'json' };
import neural from '../public/data/validation-neural.json' with { type: 'json' };
import interactions from '../public/data/validation-interactions.json' with { type: 'json' };
import { computeTargets } from './pharmacology.js';
import { diazepamInhibitionDecay, BASELINE_INHIBITION_DECAY_MS } from './neural-evidence.js';
import { interactionProfileEvidence, inhibitionWeight, staticClearanceFactor } from './interaction-evidence.js';

const mae = (rows, field) => rows.reduce((sum, row) => sum + Math.abs(row[field] - row.observed), 0) / rows.length;
const links = sources => sources.map(s => ({ title: s.title || s.citation, url: s.url }));

function petGroup(compounds) {
  const benchmark = pet.benchmarks[0], original = benchmark.originalParameters;
  const profile = compounds.find(p => p.id === benchmark.compoundId);
  if (!profile?.targets.some(t => t.target === 'D2' && t.occupancyCalibration)) throw new Error('PET benchmark requires the bundled calibrated aripiprazole profile');
  // Freeze the previous revision, but evaluate both through the production function.
  const previous = structuredClone(profile);
  previous.pk.freeFraction = original.freeFraction;
  previous.pk.brainPartition = original.brainPartition;
  previous.molecularWeight = original.molecularWeight;
  const oldTarget = previous.targets.find(t => t.target === 'D2');
  oldTarget.kiNM = original.kiNM;
  delete oldTarget.occupancyCalibration;
  const predict = (p, cp, effectState) => {
    const plasmaNM = cp * 1000 / p.molecularWeight;
    const exposure = { id: p.id, brainNM: plasmaNM * p.pk.freeFraction * p.pk.brainPartition,
      ...(effectState ? { effectSiteNM: { D2: plasmaNM } } : {}) };
    return 100 * computeTargets([exposure], [p], { D2: original.endogenousDrive }).D2.occupancy;
  };
  const rows = benchmark.points.map(point => ({
    id: point.id, label: `${point.region} · n=${point.sampleSize}`,
    input: `Total plasma ${point.input.value} ± ${point.input.uncertainty.value} ng/mL (SD); assume Ce = Cp`,
    observed: point.observed.value, unit: '%', uncertainty: `± ${point.observed.uncertainty.value} percentage points (participant SD)`,
    previousPrediction: predict(previous, point.input.value, false), currentPrediction: predict(profile, point.input.value, true),
    status: 'Independent study · conditional equilibrium', comparisonNote: 'Caudate and putamen share participants; this is a striatal curve, not a region-specific fit.',
  }));
  const metrics = { previousMAE: mae(rows, 'previousPrediction'), currentMAE: mae(rows, 'currentPrediction'), unit: 'percentage points' };
  return { id: 'pet', title: 'Human striatal aripiprazole occupancy', classification: 'Independent study · conditional comparison',
    description: 'Published Kim et al. effect-model parameters replace the old Ki/free-plasma occupancy estimate. Ito et al. observations are from a separate study. The error metric uses four regional group means; the imported calibration study is excluded.',
    metrics, rows, sources: links(pet.sources), limitations: [...benchmark.limitations,
      ...benchmark.rangePoints.map(p => `${p.region}, n=2: plasma ${p.input.range.join('–')} ng/mL and occupancy ${p.observed.range.join('–')}%. Reported ranges have no paired observations or mean and are excluded from MAE.`),
      'The live effect compartment uses published ke0=0.725/h; this conditional comparison does not independently test its transient accuracy.'] };
}

function neuralGroups() {
  const makeRow = point => {
    const acute = 100 * (diazepamInhibitionDecay(point.concentrationNM).inhibitionDecayMs / BASELINE_INHIBITION_DECAY_MS - 1);
    const chronic = point.comparisonClass === 'unsupported-chronic-history';
    return { id: point.id, label: point.label, input: `${point.concentrationNM} nM bath concentration · ${point.preparation}`,
      observed: point.observed.mean, unit: '%', uncertainty: point.observed.sem === null ? 'Ratio of group means; paired covariance unavailable, no derived SEM' : `± ${point.observed.sem}% SEM; ${point.observed.cells} cells, ${point.observed.cultures} cultures`,
      previousPrediction: chronic ? null : acute, currentPrediction: chronic ? null : acute,
      status: chronic ? 'Unsupported exposure history' : 'Discrepancy retained · different preparation',
      comparisonNote: point.observed.basis,
      ...(chronic ? { alternatives: [{ label: 'Acute-only curve (%); NOT a chronic-regimen prediction', value: acute }] } : {}) };
  };
  return ['cross-preparation', 'unsupported-chronic-history'].map(kind => {
    const points = neural.benchmarks.filter(p => p.comparisonClass === kind);
    return { id: `neural-${kind}`, title: kind === 'cross-preparation' ? 'Diazepam synaptic decay: transfer stress tests' : 'Chronic diazepam: missing tolerance dynamics',
      classification: kind === 'cross-preparation' ? 'Independent experiments · different preparations' : 'Exposure history not modeled', description: kind === 'cross-preparation'
        ? 'The existing hippocampal calibration overpredicts relative decay prolongation in these different cortical and amygdala preparations. Retuning it to either study would conceal preparation and endpoint differences, so coefficients remain unchanged.'
        : 'A concentration-only model cannot reproduce a seven-day exposure history. No adaptation or recovery rate is inferred from one chronic endpoint.',
      rows: points.map(makeRow), limitations: [...new Set(points.flatMap(p => p.limitations)), 'Cao 2018 calibration observations are excluded from independent comparisons; bath-to-brain and single-exponential transfers remain assumptions.'],
      sources: links(neural.sources.filter(s => points.some(p => p.sourceId === s.id))) };
  });
}

function interactionGroup(compounds) {
  const profile = compounds.find(p => p.id === interactions.parentCompoundId);
  const assay = interactionProfileEvidence(profile).inhibitionAssays.find(a => a.enzyme === interactions.enzyme);
  if (!assay) throw new Error('Interaction benchmark requires the bundled bupropion parent assay');
  const parent = interactions.components.find(c => c.isParent);
  const parentWeight = inhibitionWeight(parent.freePlasmaNM, assay);
  const allWeight = interactions.components.reduce((sum, c) => sum + c.freePlasmaNM / c.kiNM, 0);
  const aucr = (fm, weight) => 1 / staticClearanceFactor(fm, weight);
  return { id: 'interactions', title: 'Bupropion metabolic interactions: parent-model shortfall', classification: interactions.classification,
    description: 'The production clearance equation is tested with study-context free parent concentration and literature substrate fractions. These are static equation diagnostics, not simulations of full dosing regimens. Adding measured metabolite inputs is a reference calculation only; hepatic enrichment is an explicitly estimated sensitivity analysis.',
    rows: interactions.cases.map(c => ({ id: c.id, label: c.label, input: `fm=${c.fractionMetabolized}; study parent free plasma ${parent.freePlasmaNM} nM; n=${c.sampleSize}`,
      observed: c.observedAUCR, unit: '× AUC', uncertainty: 'Reported study ratio; no uncertainty interval curated',
      previousPrediction: aucr(c.fractionMetabolized, parentWeight), currentPrediction: aucr(c.fractionMetabolized, parentWeight), status: 'Underprediction retained · static parent-only diagnostic',
      comparisonNote: `${c.observedEndpoint}. ${c.fractionProvenance}${c.retrievalLimit ? ` ${c.retrievalLimit}` : ''}`,
      alternatives: [{ label: 'Measured parent + metabolite plasma inputs (× AUC), reference calculation', value: aucr(c.fractionMetabolized, allWeight) },
        { label: 'Animal-derived liver scaling (× AUC), sensitivity interval NOT confidence interval', range: interactions.liverScale.range.map(scale => aucr(c.fractionMetabolized, allWeight * scale)) }] })),
    sources: links(interactions.sources), limitations: [...interactions.limitations, interactions.componentEvidence.bindingConflict,
      'All five cases share the inhibitor exposure inputs; they are not five participant-matched independent validations. Reference substrates are not added to the live drug catalog. No arbitrary multiplier is applied to make the live model reproduce the observed ratios.'] };
}

/** Use the released catalog, not mutable user/imported profiles. */
export function runValidation(catalog) {
  const compounds = Array.isArray(catalog) ? catalog : catalog.compounds;
  return { modelVersion: '3.4.0', scope: 'Bundled release benchmarks compare selected outputs with published human PET, animal-cell electrophysiology and clinical interaction results. The aripiprazole occupancy correction introduced in 3.3 is retained; remaining discrepancies and unmodeled outcomes remain visible. This report does not evaluate the current virtual mixture or imported profiles, internal anatomical shapes, or qualitative hormone pathways.',
    groups: [petGroup(compounds), ...neuralGroups(), interactionGroup(compounds)],
    coverage: [
      { layer: 'Internal anatomy and hormone pathways', status: 'Qualitative reference', detail: 'Internal meshes are schematic and unregistered. Hormone routes describe physiology; tracer motion is illustrative. No endocrine concentration, feedback kinetics or drug-induced hormonal change is calculated.' },
      { layer: 'Systemic and brain concentrations', status: 'Not independently validated', detail: 'Virtual bolus kinetics, brain partition and exchange are simplified; measured plasma or bath inputs bypass those layers in these benchmarks. Oral absorption, dynamic metabolites and individual variability are missing.' },
      { layer: 'Regional activity and firing', status: 'Not validated', detail: 'PET receptor-density weights are spatial observations, not measurements of drug-induced regional firing or connectivity. No human EEG/fMRI or spike-train agreement is established.' },
      { layer: 'Target function and drug mixtures', status: 'Estimated transfer', detail: 'Binding Ki, PET occupancy and assay functional response are different endpoints. Mixture competition, network gains and the transfer of striatal D2/3 occupancy to other regions remain unvalidated.' },
      { layer: 'Long-term responses', status: 'Unsupported', detail: 'Tolerance, receptor regulation, metabolite formation, withdrawal and weeks-long clinical adaptation are not reproduced by these acute or static comparisons.' },
      { layer: 'Other molecules and endpoints', status: 'Not evaluated', detail: 'These selected benchmarks do not validate the remaining catalog, vitamins, arbitrary molecular lookup, subjective effects, or safety of combinations.' },
      { layer: 'Cognition and consciousness', status: 'Illustrative only', detail: 'Symbolic workspace and optional language-model responses are interface models; thoughts, intelligence and consciousness are not biological validation endpoints.' },
    ] };
}
