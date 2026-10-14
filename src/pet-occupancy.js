/**
 * Target-specific human PET occupancy calibration. The effect concentration
 * has total-plasma-equivalent units: it is neither measured free brain drug
 * nor Kp,uu. It is kept separate from binding Ki and functional assay EC50.
 */
import evidence from '../public/data/validation-pet.json' with { type: 'json' };

export const PET_VALIDATION_EVIDENCE = evidence;
export const ARIPIPRAZOLE_PET_CALIBRATION = Object.freeze(structuredClone(evidence.calibrationModels[0]));

const nonnegative = (value, name) => {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  return value;
};
const positive = (value, name) => {
  nonnegative(value, name);
  if (value === 0) throw new RangeError(`${name} must be positive`);
  return value;
};

export function validateOccupancyCalibration(calibration, sources = []) {
  if (!calibration || calibration.kind !== 'pet-effect-compartment') throw new TypeError('Unknown PET occupancy calibration');
  if (typeof calibration.id !== 'string' || !calibration.id.trim()) throw new TypeError('PET calibration requires an id');
  positive(calibration.ec50NgML, 'PET ec50NgML');
  positive(calibration.effectRatePerHour, 'PET effectRatePerHour');
  positive(calibration.maximum, 'PET maximum');
  if (calibration.maximum > 1) throw new RangeError('PET maximum must not exceed one');
  if (!Array.isArray(calibration.sourceIds) || !calibration.sourceIds.length) throw new TypeError('PET calibration requires sources');
  const ids = new Set(sources.map(source => typeof source === 'string' ? source : source.id));
  if (calibration.sourceIds.some(id => !ids.has(id))) throw new TypeError('PET calibration refers to a missing source');
  return calibration;
}

/** Exact solution of dCe/dt = ke0 (Cp - Ce) for a constant mean Cp.
 * Callers approximate their changing Cp by the interval mean and must check
 * convergence separately; this function does not remove mass from plasma.
 */
export function advanceEffectSite(currentNM, meanPlasmaNM, ratePerHour, hours) {
  nonnegative(currentNM, 'effect concentration'); nonnegative(meanPlasmaNM, 'plasma concentration');
  nonnegative(ratePerHour, 'effect rate'); nonnegative(hours, 'hours');
  const fraction = -Math.expm1(-ratePerHour * hours);
  return currentNM * (1 - fraction) + meanPlasmaNM * fraction;
}

/** nM × (g/mol) / 1000 = ng/mL. The published EC50 already includes in-vivo
 * competition and must not acquire an extra endogenous-drive denominator.
 */
export function occupancyFromEffectSite(effectSiteNM, molecularWeight, calibration) {
  nonnegative(effectSiteNM, 'effect concentration'); positive(molecularWeight, 'molecular weight');
  positive(calibration?.ec50NgML, 'PET ec50NgML'); positive(calibration?.maximum, 'PET maximum');
  if (calibration.maximum > 1) throw new RangeError('PET maximum must not exceed one');
  if (effectSiteNM === 0) return 0;
  const concentrationNgML = effectSiteNM * molecularWeight / 1000;
  return calibration.maximum / (1 + calibration.ec50NgML / concentrationNgML);
}
