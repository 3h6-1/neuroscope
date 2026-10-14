import test from 'node:test';
import assert from 'node:assert/strict';
import { ARIPIPRAZOLE_PET_CALIBRATION as calibration, PET_VALIDATION_EVIDENCE as data, advanceEffectSite, occupancyFromEffectSite, validateOccupancyCalibration } from '../src/pet-occupancy.js';

test('PET calibration retains the published effect concentration and its independent study provenance', () => {
  validateOccupancyCalibration(calibration, data.sources);
  assert.equal(calibration.ec50NgML, 8.63);
  assert.equal(calibration.effectRatePerHour, 0.725);
  const check = data.benchmarks[0];
  assert.ok(check.sourceIds.every(id => !check.calibrationSourceIds.includes(id)));
  assert.equal(new Set(check.points.map(p => p.groupId)).size, 2);
  assert.ok(check.points.every(p => p.input.uncertainty.kind === 'SD' && p.observed.uncertainty.kind === 'SD'));
  assert.ok(check.rangePoints.every(p => p.includeInMAE === false && !('value' in p.observed)));
});

test('effect compartment is a delayed plasma-equivalent signal, with no jump on exposure', () => {
  assert.equal(advanceEffectSite(0, 100, 0.725, 0), 0);
  const halfTime = Math.log(2) / 0.725;
  assert.ok(Math.abs(advanceEffectSite(0, 100, 0.725, halfTime) - 50) < 1e-12);
  assert.ok(Math.abs(advanceEffectSite(100, 0, 0.725, halfTime) - 50) < 1e-12);
  assert.equal(advanceEffectSite(20, 100, 0, 24), 20);
  assert.equal(advanceEffectSite(20, 100, 0.725, 1e6), 100);
  const single = advanceEffectSite(20, 100, 0.725, 2);
  const divided = advanceEffectSite(advanceEffectSite(20, 100, 0.725, 0.8), 100, 0.725, 1.2);
  assert.ok(Math.abs(single - divided) < 1e-12);
});

test('nM conversion uses total-plasma-equivalent concentration rather than free fraction', () => {
  const molecularWeight = 448.4;
  assert.equal(occupancyFromEffectSite(0, molecularWeight, calibration), 0);
  assert.ok(Math.abs(occupancyFromEffectSite(8.63 * 1000 / molecularWeight, molecularWeight, calibration) - 0.5) < 1e-12);
  assert.ok(Math.abs(occupancyFromEffectSite(77.67 * 1000 / molecularWeight, molecularWeight, calibration) - 0.9) < 1e-12);
});

test('external aggregate PET comparison improves without eliminating the residual mismatch', () => {
  const check = data.benchmarks[0], p = check.originalParameters;
  const errors = check.points.map(point => {
    const c = point.input.value * 1000 / p.molecularWeight;
    const weight = c * p.freeFraction * p.brainPartition / p.kiNM;
    const original = 100 * weight / (1 + p.endogenousDrive + weight);
    const current = 100 * occupancyFromEffectSite(c, p.molecularWeight, calibration);
    return { old: Math.abs(original - point.observed.value), current: Math.abs(current - point.observed.value) };
  });
  const mean = key => errors.reduce((s, e) => s + e[key], 0) / errors.length;
  assert.ok(Math.abs(mean('old') - 20.81138231015858) < 1e-9);
  assert.ok(Math.abs(mean('current') - 4.116943762833994) < 1e-9);
  assert.ok(errors[3].current > 8, 'remaining putamen mismatch must remain visible');
});

test('malformed PET parameters and missing source references fail validation', () => {
  assert.throws(() => validateOccupancyCalibration(calibration, []), /missing source/);
  for (const ec50NgML of [0, -1, Infinity, NaN]) assert.throws(() => validateOccupancyCalibration({ ...calibration, ec50NgML }, data.sources));
  assert.throws(() => validateOccupancyCalibration({ ...calibration, maximum: 2 }, data.sources));
  assert.throws(() => advanceEffectSite(-1, 20, 0.725, 1));
  assert.throws(() => advanceEffectSite(0, Infinity, 0.725, 1));
  assert.throws(() => occupancyFromEffectSite(1, 0, calibration));
});
