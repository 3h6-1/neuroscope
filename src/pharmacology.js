/**
 * Transparent, illustrative PK/PD, NOT a prescribing or treatment model.
 * All exposures are virtual bloodstream concentrations (nM), never doses.
 * Amounts are nmol; time is hours. Plasma is a total-concentration pool and
 * brain is an unbound-equivalent pool. Volumes, Kp,uu, and equilibration times
 * are explicit model assumptions; regional exposure and active metabolites
 * are not inferred from chemical structure.
 */
import { validateFunctionalAssay, functionalResponse, responsePool } from './functional-response.js';
import { computeMetabolicInteractions } from './interaction-evidence.js';
import { validateOccupancyCalibration, advanceEffectSite, occupancyFromEffectSite } from './pet-occupancy.js';

export const PK_DT_HOURS = 1 / 240;
export const TARGET_IDS = Object.freeze(['SERT', 'DAT', 'NET', 'D2', 'HT2A', 'HT1A', 'GABAA', 'NMDA', 'ADENOSINE', 'NACHR']);
export const DEFAULT_ENDOGENOUS_DRIVE = Object.freeze({ D2: 2 / 3, HT2A: 1 / 9, HT1A: 0.25, GABAA: 1 / 3, NMDA: 1, ADENOSINE: 2 / 3, NACHR: 1 / 19 });
export const PHARMACOLOGY_LIMITATIONS = Object.freeze([
  'Bloodstream boluses are arbitrary virtual concentrations, not medication doses or a route-of-administration model.',
  'Brain is an unbound-equivalent compartment; free fractions, volumes, Kp,uu and equilibration are simplified and may be assumed.',
  'Affinity values from different assays are not necessarily directly comparable; occupancy is an equilibrium approximation.',
  'Selected target occupancy uses an empirical human PET effect-compartment model. PET occupancy is distinct from functional activation; transfer to mixtures, regions and neural effects remains unvalidated.',
  'Active metabolites, regional distribution, tolerance and long-term adaptation are not dynamically modeled.',
  'Selected CYP interactions use measured parent Ki and study-derived clearance fractions. Liver exposure, pathway transfer and mixture additivity remain estimates; missing potency or clearance evidence leaves an interaction unquantified.',
  'Target changes drive a phenomenological neural network and cannot predict behavior, experience, safety or treatment response.',
]);

const clone = value => structuredClone(value);
const finite = (value, name, minimum = 0) => {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${name} must be finite and ≥ ${minimum}`);
  return value;
};
const positive = (value, name) => {
  finite(value, name);
  if (value === 0) throw new RangeError(`${name} must be positive`);
  return value;
};
const fraction = (value, name) => {
  finite(value, name);
  if (value > 1) throw new RangeError(`${name} must not exceed 1`);
  return value;
};

function targetName(name) {
  const key = String(name).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ({ '5HT2A': 'HT2A', '5HT1A': 'HT1A', GABAA: 'GABAA', ADENOSINEA1: 'ADENOSINE', NICOTINIC: 'NACHR' })[key] || key;
}

function actionName(action) {
  const key = String(action || '').toLowerCase().replace(/[ -]/g, '_');
  return ({ partialagonist: 'partial_agonist', positive_allosteric_modulator: 'pam', allosteric_modulator: 'pam', blocker: 'channel_blocker', reuptake_inhibitor: 'inhibitor' })[key] || key;
}

/** Validate supplied parameters without inventing missing affinity or PK. */
export function validateCompound(profile) {
  if (!profile || typeof profile !== 'object' || typeof profile.id !== 'string' || !profile.id.trim()) throw new TypeError('Compound requires a nonempty id');
  if (typeof profile.name !== 'string' || !profile.name.trim()) throw new TypeError('Compound requires a name');
  const p = clone(profile);
  p.targets = p.targets || [];
  if (!Array.isArray(p.targets)) throw new TypeError('targets must be an array');
  p.targets = p.targets.map(t => {
    if (!t || typeof t !== 'object') throw new TypeError('Each target must be an object');
    const target = targetName(t.target);
    const action = actionName(t.action);
    if (t.kiNM != null) positive(t.kiNM, `${target} kiNM`);
    if (t.efficacy != null) fraction(t.efficacy, `${target} efficacy`);
    if (t.kiNM != null && !['inhibitor', 'antagonist', 'agonist', 'partial_agonist', 'pam', 'channel_blocker', 'cofactor'].includes(action)) throw new TypeError(`Unknown action: ${action}`);
    if ((action === 'partial_agonist' || action === 'agonist') && t.kiNM != null && t.efficacy == null) throw new TypeError(`${target} agonism requires an explicit efficacy`);
    let efficacy = t.efficacy;
    if (t.kiNM != null) {
      if (!TARGET_IDS.includes(target)) throw new TypeError(`Unsupported quantitative target: ${target}`);
      if (action === 'cofactor') throw new TypeError('Cofactor pathways require qualitative evidence, not a numerical receptor affinity');
      const transporter = ['SERT', 'DAT', 'NET'].includes(target);
      if (transporter && action !== 'inhibitor') throw new TypeError(`${target} supports transport inhibition only`);
      if (!transporter && action === 'inhibitor') throw new TypeError(`${target} requires a receptor action, not transporter inhibition`);
      if (['inhibitor', 'antagonist', 'channel_blocker'].includes(action)) {
        efficacy ??= 0;
        if (efficacy !== 0) throw new RangeError(`${action} must have efficacy 0; it does not activate the target`);
      }
      if (action === 'agonist' && efficacy !== 1) throw new RangeError('Full agonist efficacy must be 1; use partial_agonist for a fractional response');
      if (action === 'pam' && efficacy !== 1) throw new RangeError('PAM efficacy must be the unit placeholder 1; potentiation uses a separate functional curve or estimated gain');
    }
    if (t.functionalAssay != null) {
      if (t.kiNM == null) throw new TypeError('Functional profiles require a separately labeled binding model scale');
      validateFunctionalAssay(t.functionalAssay, action);
      const sources = new Set((p.sources || []).map(source => source.id));
      if (t.functionalAssay.sourceIds.some(id => !sources.has(id))) throw new TypeError('Functional assay refers to a missing source');
    }
    if (t.occupancyCalibration != null) {
      if (target !== 'D2' || !['agonist', 'partial_agonist', 'antagonist'].includes(action)) throw new TypeError('The PET occupancy model supports orthosteric D2 mechanisms only');
      if (t.kiNM == null) throw new TypeError('PET occupancy requires a separately labeled binding affinity');
      positive(p.molecularWeight, 'molecularWeight for PET concentration conversion');
      validateOccupancyCalibration(t.occupancyCalibration, p.sources || []);
    }
    return { ...t, target, action, ...(efficacy != null ? { efficacy } : {}) };
  });
  if (p.pk != null) {
    for (const field of ['halfLifeH', 'brainPartition', 'brainEquilibrationH']) if (p.pk[field] != null) positive(p.pk[field], `pk.${field}`);
    if (p.pk.freeFraction != null) fraction(p.pk.freeFraction, 'pk.freeFraction');
  }
  p.metabolism = p.metabolism || { substrate: [], inhibits: [] };
  if (!Array.isArray(p.metabolism.substrate || []) || !Array.isArray(p.metabolism.inhibits || [])) throw new TypeError('Metabolism pathways must be arrays');
  return p;
}

function supportedProfile(p) {
  if (!p) return { supported: false, reason: 'Unknown compound: provide an explicit curated or custom PK/PD profile; molecular structure alone is insufficient.' };
  if (p.simulationSupported === false) return { supported: false, reason: p.unsupportedReason || 'This compound has no supported acute PK/PD model; no neurotransmitter action is inferred.' };
  if (!p.pk || ['halfLifeH', 'freeFraction', 'brainPartition', 'brainEquilibrationH'].some(key => !Number.isFinite(p.pk[key]))) {
    return { supported: false, reason: 'Missing explicit half-life, free fraction, Kp,uu, or brain equilibration; the structure may be viewed but exposure is unsupported.' };
  }
  return { supported: true };
}

/** Exact exponential for the positive linear system
 * P' = -(ke + kPB)P + kBP B; B' = kPB P - kBP B.
 * Elimination happens only from plasma. This propagator conserves P+B when
 * ke=0 and never creates mass. It is stable for arbitrarily long intervals.
 */
export function propagateTwoCompartment(plasmaAmount, brainAmount, rates, hours) {
  finite(plasmaAmount, 'plasma amount'); finite(brainAmount, 'brain amount'); finite(hours, 'hours');
  const ke = finite(rates.ke, 'ke'), kPB = finite(rates.kPB, 'kPB'), kBP = finite(rates.kBP, 'kBP');
  if (hours === 0) return { plasmaAmount, brainAmount, eliminatedAmount: 0 };
  const halfTrace = -(ke + kPB + kBP) / 2;
  const diagonal = (kBP - ke - kPB) / 2;
  const discriminant = Math.sqrt(diagonal * diagonal + kPB * kBP);
  let scalar, factor;
  if (discriminant < 1e-14) {
    scalar = Math.exp(halfTrace * hours);
    factor = scalar * hours;
  } else {
    const positiveMode = Math.exp((halfTrace + discriminant) * hours);
    const negativeMode = Math.exp((halfTrace - discriminant) * hours);
    scalar = (positiveMode + negativeMode) / 2;
    factor = (positiveMode - negativeMode) / (2 * discriminant);
  }
  let plasma = Math.max(0, scalar * plasmaAmount + factor * (diagonal * plasmaAmount + kBP * brainAmount));
  let brain = Math.max(0, scalar * brainAmount + factor * (kPB * plasmaAmount - diagonal * brainAmount));
  const initial = plasmaAmount + brainAmount;
  // Remove at most round-off-scale excess while preserving compartment ratio.
  if (plasma + brain > initial) { const scale = initial / (plasma + brain); plasma *= scale; brain *= scale; }
  return { plasmaAmount: plasma, brainAmount: brain, eliminatedAmount: Math.max(0, initial - plasma - brain) };
}

/** Equilibrium competition. Agonists, partial agonists and antagonists compete
 * with endogenous ligand at orthosteric sites. PAMs are a separate allosteric
 * pool and require endogenous activation. Channel blockade is a separate pool.
 */
export function computeTargets(exposures, compounds, endogenousDrive = DEFAULT_ENDOGENOUS_DRIVE) {
  const profiles = compounds instanceof Map ? compounds : new Map((Array.isArray(compounds) ? compounds : compounds.compounds || []).map(p => [p.id, p]));
  const targets = {};
  for (const target of TARGET_IDS) {
    const transporter = ['SERT', 'DAT', 'NET'].includes(target);
    const drive = finite(endogenousDrive[target] ?? 0, `${target} endogenous drive`);
    const baselineActivity = transporter ? 1 : drive / (1 + drive);
    const candidates = [];
    for (const exposure of exposures) {
      const profile = profiles.get(exposure.id);
      if (!profile || exposure.active === false) continue;
      for (const definition of profile.targets || []) {
        if (targetName(definition.target) !== target || !Number.isFinite(definition.kiNM) || definition.kiNM <= 0 || definition.action === 'cofactor') continue;
        const action = actionName(definition.action);
        const concentrationNM = finite(exposure.brainNM ?? 0, `${profile.id} brain concentration`);
        const hasPETState = exposure.effectSiteNM?.[target] !== undefined;
        const calibration = !profile.custom && hasPETState ? definition.occupancyCalibration : null;
        const effectSiteNM = calibration ? finite(exposure.effectSiteNM?.[target] ?? 0, `${profile.id} PET effect-site concentration`) : null;
        const petOccupancy = calibration ? occupancyFromEffectSite(effectSiteNM, profile.molecularWeight, calibration) : null;
        // A PET concentration-occupancy curve already incorporates baseline
        // endogenous competition. Normalize its odds to the current baseline
        // once; additional drug competition is an explicitly unvalidated rule.
        const weight = calibration ? (1 + drive) * petOccupancy / Math.max(1e-12, 1 - petOccupancy) : concentrationNM / definition.kiNM;
        candidates.push({ id: profile.id, name: profile.name, action, concentrationNM,
          affinityNM: definition.kiNM, efficacy: definition.efficacy ?? 0, weight, functionalWeight: concentrationNM / definition.kiNM,
          custom: Boolean(profile.custom),
          ...(!profile.custom && definition.occupancyCalibration && !hasPETState ? { occupancyCalibrationUnavailable: 'PET effect-site history not supplied; using the original assay-based binding approximation.' } : {}),
          bindingEvidence: calibration ? 'human PET occupancy calibration; conditional external benchmark only' : definition.evidenceType === 'assay' && !profile.custom ? 'assay-derived binding model' : 'estimated binding proxy',
          ...(calibration ? { occupancyCalibration: calibration, effectSiteNM, effectSiteNgML: effectSiteNM * profile.molecularWeight / 1000, petSingleCompoundOccupancy: petOccupancy } : {}),
          ...(definition.functionalAssay ? { functionalAssay: definition.functionalAssay } : {}),
          ...(!profile.custom && definition.neuralCalibrationId ? { neuralCalibrationId: definition.neuralCalibrationId } : {}),
        });
      }
    }
    const orthosteric = candidates.filter(c => !['pam', 'channel_blocker'].includes(c.action));
    const allosteric = candidates.filter(c => c.action === 'pam');
    const channel = candidates.filter(c => c.action === 'channel_blocker');
    const sum = entries => entries.reduce((n, c) => n + c.weight, 0);
    const denominator = 1 + (transporter ? 0 : drive) + sum(orthosteric);
    const pamDenominator = 1 + sum(allosteric), channelDenominator = 1 + sum(channel);
    const contributors = [
      ...orthosteric.map(c => ({ ...c, site: 'orthosteric', occupancy: c.weight / denominator })),
      ...allosteric.map(c => ({ ...c, site: 'allosteric', occupancy: c.weight / pamDenominator })),
      ...channel.map(c => ({ ...c, site: 'channel', occupancy: c.weight / channelDenominator })),
    ];
    const orthostericOccupancy = sum(orthosteric) / denominator;
    const allostericOccupancy = sum(allosteric) / pamDenominator;
    const channelOccupancy = sum(channel) / channelDenominator;
    // PET calibrates displacement only; it does not replace a functional
    // concentration-response model, even at zero brain concentration or when
    // an imported profile lacks a functional assay.
    const functionalDenominator = 1 + (transporter ? 0 : drive) + orthosteric.reduce((n, c) => n + c.functionalWeight, 0);
    let activity = transporter ? 1 - orthostericOccupancy : drive / functionalDenominator + orthosteric.reduce((n, c) => n + c.functionalWeight * c.efficacy / functionalDenominator, 0);
    // Functional endpoints get their own response pool, never the Ki-based
    // occupancy denominator. Baseline interpolation and cross-assay pooling
    // are declared assumptions even when EC50/IC50/Emax are measurements.
    if (orthosteric.some(c => c.functionalAssay && c.concentrationNM > 0)) {
      // Normalize legacy ligand weights by endogenous drive so introducing
      // an infinitesimal assay-backed ligand cannot jump an existing mixture.
      const pool = responsePool(orthosteric, c => transporter ? 1 : c.efficacy, c => c.functionalWeight / (transporter ? 1 : 1 + drive));
      activity = transporter ? 1 - pool.weightedResponse / pool.denominator : (baselineActivity + pool.weightedResponse) / pool.denominator;
    }
    const pamPool = responsePool(allosteric, () => 2);
    const channelPool = responsePool(channel, () => 1);
    activity = Math.min(1, activity * (1 + pamPool.weightedResponse / pamPool.denominator)) * (1 - channelPool.weightedResponse / channelPool.denominator);
    const functionalResponses = candidates.filter(c => c.functionalAssay).map(c => ({
      id: c.id, name: c.name, concentrationNM: c.concentrationNM,
      assayResponse: functionalResponse(c.concentrationNM, c.functionalAssay), assay: c.functionalAssay,
      evidenceBasis: c.custom ? 'User-supplied assay hypothesis; not independently verified' : 'Curated assay reference; estimated transfer to the modeled brain',
    }));
    targets[target] = {
      id: target, kind: transporter ? 'transporter' : 'receptor',
      occupancy: 1 - (1 - orthostericOccupancy) * (1 - allostericOccupancy) * (1 - channelOccupancy),
      orthostericOccupancy, allostericOccupancy, channelOccupancy,
      baselineActivity, activity, delta: activity - baselineActivity,
      endogenousDrive: drive, contributors,
      functionalResponses,
      responseBasis: functionalResponses.length ? (candidates.some(c => c.custom && c.functionalAssay) ? 'Includes user-supplied assay hypotheses; estimated transfer to brain and mixture response' : 'Experimental assay curve; estimated transfer to brain and mixture response') : 'Estimated activity from binding model and assumed efficacy',
      occupancyEvidence: candidates.some(c => c.occupancyCalibration) ? 'Includes human PET effect-compartment calibration; external aggregate comparison is conditional, and mixture competition remains unvalidated' : candidates.some(c => c.bindingEvidence === 'estimated binding proxy') ? 'Estimated binding proxy; at least one affinity scale is assumed' : 'Assay-derived binding model; not measured in-vivo occupancy',
      interpretation: transporter ? 'Fractional transport capacity; inhibition is 1 − activity.' : 'Illustrative receptor drive, not a clinical effect or firing rate.',
    };
  }
  return targets;
}

export class PharmacologySimulation {
  constructor(catalog, options = {}) {
    const { endogenousDrive, ...numericOptions } = options;
    this.options = { seed: 42, stepHours: PK_DT_HOURS, plasmaVolumeL: 3, brainVolumeL: 1.4, interactionModel: 'evidence-v1', ...numericOptions };
    positive(this.options.stepHours, 'stepHours'); positive(this.options.plasmaVolumeL, 'plasmaVolumeL'); positive(this.options.brainVolumeL, 'brainVolumeL');
    if (!['evidence-v1', 'legacy-estimated'].includes(this.options.interactionModel)) throw new TypeError('Unknown interaction model');
    if (this.options.interactionModel === 'legacy-estimated') {
      this.options.cypInhibitionI50NM ??= 100; this.options.cyp2d6ClearanceFraction ??= 0.5;
      positive(this.options.cypInhibitionI50NM, 'cypInhibitionI50NM'); fraction(this.options.cyp2d6ClearanceFraction, 'cyp2d6ClearanceFraction');
    }
    this.compounds = new Map();
    for (const profile of (Array.isArray(catalog) ? catalog : catalog?.compounds || [])) this.registerCompound(profile);
    this.endogenousDrive = { ...DEFAULT_ENDOGENOUS_DRIVE, ...endogenousDrive };
    this.reset();
  }

  registerCompound(profile) {
    const normalized = validateCompound(profile);
    if (this.records?.[normalized.id]?.active) throw new Error('Remove the existing exposure before changing its profile');
    this.compounds.set(normalized.id, normalized);
    return { id: normalized.id, ...supportedProfile(normalized) };
  }

  reset() {
    this.timeHours = 0; this.ticks = 0; this.accumulator = 0;
    this.records = Object.create(null); this.ledger = [];
    return this;
  }

  addExposure(compoundId, initialPlasmaNM = 100) {
    positive(initialPlasmaNM, 'initialPlasmaNM');
    const profile = this.compounds.get(compoundId);
    const support = supportedProfile(profile);
    if (!support.supported) return { id: compoundId, ...support };
    const amount = initialPlasmaNM * this.options.plasmaVolumeL;
    let record = this.records[compoundId];
    if (!record) record = this.records[compoundId] = { id: compoundId, active: true, plasmaAmountNMol: 0, brainAmountNMol: 0, initialAmountNMol: 0, eliminatedNMol: 0, removedNMol: 0, clearanceFactor: 1, effectSiteNM: Object.fromEntries(profile.targets.filter(t => !profile.custom && t.occupancyCalibration).map(t => [t.target, 0])) };
    // An inactive profile may have been edited or replaced after removal.
    // Rebuild only its signal state while retaining the cumulative mass ledger.
    if (!record.active) record.effectSiteNM = Object.fromEntries(profile.targets.filter(t => !profile.custom && t.occupancyCalibration).map(t => [t.target, 0]));
    record.active = true; record.plasmaAmountNMol += amount; record.initialAmountNMol += amount;
    this.ledger.push({ type: 'exposure', id: compoundId, timeHours: this.timeHours, concentrationNM: initialPlasmaNM, amountNMol: amount });
    return { supported: true, id: compoundId, exposure: this._exposure(record) };
  }

  removeExposure(compoundId) {
    const record = this.records[compoundId];
    if (!record?.active) return false;
    const amount = record.plasmaAmountNMol + record.brainAmountNMol;
    record.removedNMol += amount; record.plasmaAmountNMol = 0; record.brainAmountNMol = 0; record.active = false;
    if (record.effectSiteNM) for (const target of Object.keys(record.effectSiteNM)) record.effectSiteNM[target] = 0;
    this.ledger.push({ type: 'remove', id: compoundId, timeHours: this.timeHours, amountNMol: amount });
    return true;
  }

  _rates(profile, clearanceFactor) {
    const { plasmaVolumeL: vp, brainVolumeL: vb } = this.options;
    const { freeFraction: free, brainPartition: kp, brainEquilibrationH: tau, halfLifeH } = profile.pk;
    const exchange = 1 / tau;
    const ratio = free * kp * vb / vp;
    const kBP = exchange / (1 + ratio), kPB = exchange - kBP;
    const terminal = Math.LN2 / halfLifeH;
    // Calibrate the slower eigenvalue to the supplied terminal half-life.
    // An arbitrarily slow brain-exit compartment cannot support a faster
    // terminal decay: that unsupported calibration is explicitly flagged.
    const calibrated = kBP > terminal;
    const plasmaElimination = calibrated ? terminal * (exchange - terminal) / (kBP - terminal) : terminal;
    return { ke: plasmaElimination * clearanceFactor, kPB, kBP, calibrated };
  }

  _interactionState(includeEvidence = true) {
    if (this.options.interactionModel === 'legacy-estimated') return this._legacyInteractionState();
    const exposures = Object.values(this.records).filter(r => r.active).map(record => ({
      id: record.id, freePlasmaNM: record.plasmaAmountNMol / this.options.plasmaVolumeL * this.compounds.get(record.id).pk.freeFraction,
    }));
    return computeMetabolicInteractions(exposures, this.compounds, { includeEvidence });
  }

  // Historical constants only for replaying older saved experiments. New
  // simulations never use the shared 100 nM potency or 50% clearance fraction.
  _legacyInteractionState() {
    const active = Object.values(this.records).filter(r => r.active);
    const inhibitors = active.filter(r => (this.compounds.get(r.id).metabolism.inhibits || []).some(e => String(typeof e === 'string' ? e : e.enzyme).toUpperCase() === 'CYP2D6'));
    const inhibitionWeight = inhibitors.reduce((sum, r) => sum + r.plasmaAmountNMol / this.options.plasmaVolumeL * this.compounds.get(r.id).pk.freeFraction / this.options.cypInhibitionI50NM, 0);
    const inhibition = inhibitionWeight / (1 + inhibitionWeight);
    const interactions = [];
    const factors = {};
    for (const record of active) {
      const profile = this.compounds.get(record.id);
      const substrate = (profile.metabolism.substrate || []).some(e => String(typeof e === 'string' ? e : e.enzyme).toUpperCase() === 'CYP2D6');
      factors[record.id] = substrate ? 1 - this.options.cyp2d6ClearanceFraction * inhibition : 1;
      if (substrate && inhibition > 0) interactions.push({ substrateId: record.id, inhibitorIds: inhibitors.map(r => r.id), enzyme: 'CYP2D6', clearanceFactor: factors[record.id], modeled: true, evidenceType: 'legacy estimate', assays: [], evidence: 'Legacy experiment: original shared inhibition constant and clearance fraction are retained for PK replay. These coefficients are illustrative, not measured. Active inhibitor metabolites are omitted.' });
    }
    return { factors, interactions };
  }

  advance(hours) {
    finite(hours, 'hours');
    this.accumulator += hours;
    const count = Math.floor((this.accumulator + 1e-12) / this.options.stepHours);
    for (let i = 0; i < count; i++) this.step();
    this.accumulator -= count * this.options.stepHours;
    if (Math.abs(this.accumulator) < 1e-12) this.accumulator = 0;
    return count;
  }

  step() {
    const { factors } = this._interactionState(false);
    for (const record of Object.values(this.records)) {
      if (!record.active) continue;
      record.clearanceFactor = factors[record.id];
      const profile = this.compounds.get(record.id);
      const rates = this._rates(profile, record.clearanceFactor);
      const result = propagateTwoCompartment(record.plasmaAmountNMol, record.brainAmountNMol, rates, this.options.stepHours);
      for (const target of profile.targets.filter(t => !profile.custom && t.occupancyCalibration)) {
        const meanPlasmaNM = (record.plasmaAmountNMol + result.plasmaAmount) / (2 * this.options.plasmaVolumeL);
        record.effectSiteNM[target.target] = advanceEffectSite(record.effectSiteNM[target.target], meanPlasmaNM, target.occupancyCalibration.effectRatePerHour, this.options.stepHours);
      }
      record.plasmaAmountNMol = result.plasmaAmount;
      record.brainAmountNMol = result.brainAmount;
      record.eliminatedNMol += result.eliminatedAmount;
    }
    this.timeHours = ++this.ticks * this.options.stepHours;
  }

  _exposure(record) {
    const profile = this.compounds.get(record.id);
    const plasmaNM = record.plasmaAmountNMol / this.options.plasmaVolumeL;
    return { ...record, effectSiteNM: clone(record.effectSiteNM || {}), name: profile.name, plasmaNM, freePlasmaNM: plasmaNM * profile.pk.freeFraction, brainNM: record.brainAmountNMol / this.options.brainVolumeL, totalAmountNMol: record.plasmaAmountNMol + record.brainAmountNMol, terminalHalfLifeCalibrated: this._rates(profile, 1).calibrated, profileAssumptions: profile.pk.evidence || null };
  }

  get stats() {
    const allExposures = Object.values(this.records).map(r => this._exposure(r));
    const exposures = allExposures.filter(e => e.active);
    const { interactions, references = [] } = this._interactionState();
    const massBalance = allExposures.reduce((m, r) => ({ introducedNMol: m.introducedNMol + r.initialAmountNMol, remainingNMol: m.remainingNMol + r.totalAmountNMol, eliminatedNMol: m.eliminatedNMol + r.eliminatedNMol, removedNMol: m.removedNMol + r.removedNMol }), { introducedNMol: 0, remainingNMol: 0, eliminatedNMol: 0, removedNMol: 0 });
    massBalance.errorNMol = massBalance.introducedNMol - massBalance.remainingNMol - massBalance.eliminatedNMol - massBalance.removedNMol;
    return { timeHours: this.timeHours, exposures, allExposures, targets: computeTargets(exposures, this.compounds, this.endogenousDrive), interactions, interactionReferences: references, massBalance, ledger: clone(this.ledger), limitations: [...PHARMACOLOGY_LIMITATIONS], migrationNote: this.options.interactionModel === 'legacy-estimated' ? 'Legacy interaction model retained for PK replay: shared assumed inhibition constant and clearance fraction. Export any work you want to keep, then reload the page for a new experiment with the current catalog and evidence model. Reset retains the imported model.' : null, model: { plasmaVolumeL: this.options.plasmaVolumeL, brainVolumeL: this.options.brainVolumeL, stepHours: this.options.stepHours, interactionModel: this.options.interactionModel } };
  }

  snapshot() {
    return clone({ version: 1, options: this.options, endogenousDrive: this.endogenousDrive, compounds: [...this.compounds.values()], records: this.records, ledger: this.ledger, ticks: this.ticks, timeHours: this.timeHours, accumulator: this.accumulator });
  }

  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1) throw new TypeError('Unsupported pharmacology checkpoint');
    const data = clone(snapshot);
    const checked = new PharmacologySimulation(data.compounds, { ...data.options, interactionModel: data.options?.interactionModel ?? 'legacy-estimated', endogenousDrive: data.endogenousDrive });
    if (!Number.isInteger(data.ticks) || data.ticks < 0 || data.timeHours !== data.ticks * checked.options.stepHours) throw new RangeError('Invalid checkpoint time');
    finite(data.accumulator, 'accumulator');
    if (data.accumulator >= checked.options.stepHours) throw new RangeError('Invalid checkpoint remainder');
    for (const record of Object.values(data.records)) {
      if (!checked.compounds.has(record.id)) throw new TypeError('Checkpoint refers to unknown compound');
      for (const key of ['plasmaAmountNMol', 'brainAmountNMol', 'initialAmountNMol', 'eliminatedNMol', 'removedNMol']) finite(record[key], key);
      const profile = checked.compounds.get(record.id);
      const calibratedTargets = profile.targets.filter(t => !profile.custom && t.occupancyCalibration).map(t => t.target);
      if (record.effectSiteNM !== undefined && (!record.effectSiteNM || typeof record.effectSiteNM !== 'object' || Array.isArray(record.effectSiteNM))) throw new TypeError('Invalid PET effect-site state');
      if (Object.keys(record.effectSiteNM || {}).some(key => !calibratedTargets.includes(key))) throw new TypeError('Unknown PET effect-site target');
      for (const target of calibratedTargets) finite(record.effectSiteNM?.[target], 'PET effect-site concentration');
    }
    this.options = checked.options; this.compounds = checked.compounds; this.endogenousDrive = checked.endogenousDrive;
    this.records = Object.assign(Object.create(null), data.records);
    for (const key of ['ledger', 'ticks', 'timeHours', 'accumulator']) this[key] = data[key];
    return this;
  }
}
