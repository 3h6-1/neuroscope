import test from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE_INHIBITION_DECAY_MS, DIAZEPAM_NEURAL_CALIBRATION, diazepamInhibitionDecay, gabaDecayCalibration } from '../src/neural-evidence.js';
import { NeuralSimulation, modulationFromTargets } from '../src/neural.js';

const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const diazepam = concentrationNM => ({
  delta: 0.3,
  contributors: [{ id: 'diazepam', action: 'pam', neuralCalibrationId: DIAZEPAM_NEURAL_CALIBRATION.id, concentrationNM, occupancy: concentrationNM / (10 + concentrationNM) }],
});

test('measured diazepam decay durations convert to equivalent tau, not mistaken for tau', () => {
  assert.ok(Object.isFrozen(DIAZEPAM_NEURAL_CALIBRATION.points));
  for (const point of DIAZEPAM_NEURAL_CALIBRATION.points) {
    const result = diazepamInhibitionDecay(point.concentrationNM);
    close(Math.exp(-point.durationMs / result.inhibitionDecayMs), 0.25);
    assert.equal(result.evidence.durationMs, point.durationMs);
    assert.equal(result.evidence.measuredDurationSdMs, point.sdMs);
    assert.equal(result.evidence.cells, point.cells);
    assert.equal(result.evidence.status, 'measured-endpoint-derived-tau');
  }
  close(BASELINE_INHIBITION_DECAY_MS, 41 / Math.log(4));
});

test('interpolation identifies estimates, honors measured bounds and never extrapolates high exposures', () => {
  const low = diazepamInhibitionDecay(5);
  close(low.evidence.durationMs, 52);
  assert.equal(low.evidence.status, 'estimated-low-concentration-interpolation');
  const midpoint = diazepamInhibitionDecay(Math.sqrt(10 * 100));
  close(midpoint.evidence.durationMs, 64);
  assert.equal(midpoint.evidence.status, 'estimated-log-concentration-interpolation');
  assert.equal(midpoint.evidence.measuredDurationSdMs, undefined);
  assert.equal(midpoint.evidence.interpolated, true);
  assert.equal(midpoint.evidence.measuredAnchor, false);
  for (const concentrationNM of [1001, 10000, 1e9]) {
    const result = diazepamInhibitionDecay(concentrationNM);
    assert.equal(result.evidence.durationMs, 87);
    assert.equal(result.evidence.status, 'capped-outside-measured-range');
    assert.equal(result.evidence.capped, true);
    assert.equal(result.evidence.extrapolated, false);
  }
  for (const invalid of [-1, NaN, Infinity, '10']) assert.throws(() => diazepamInhibitionDecay(invalid), RangeError);
});

test('calibration requires explicit compound, action, calibration identity and usable concentration', () => {
  assert.equal(gabaDecayCalibration({}), null);
  assert.equal(gabaDecayCalibration(diazepam(0)), null);
  assert.ok(gabaDecayCalibration(diazepam(100)));
  for (const patch of [{ id: 'custom-drug' }, { action: 'antagonist' }, { neuralCalibrationId: null }, { concentrationNM: NaN }]) {
    const target = diazepam(100);
    Object.assign(target.contributors[0], patch);
    assert.equal(gabaDecayCalibration(target), null);
  }
});

test('unmatched active GABAA mixtures retain explicitly estimated gains, never borrow single-drug kinetics', () => {
  const target = diazepam(100);
  target.contributors.push({ id: 'custom-pam', action: 'pam', concentrationNM: 20, occupancy: 0.2 });
  const modulation = modulationFromTargets({ GABAA: target });
  assert.equal(modulation.inhibitionDecayMs, BASELINE_INHIBITION_DECAY_MS);
  close(modulation.inhibitoryGain, 2.2);
  close(modulation.excitatoryBias, -0.9);
  assert.equal(modulation.inhibitionEvidence.status, 'estimated-unmatched-gabaa-effect');
});

test('calibrated diazepam changes decay without double-counting current gain or direct bias', () => {
  const modulation = modulationFromTargets({ GABAA: diazepam(10) });
  close(modulation.inhibitionDecayMs, 63 / Math.log(4));
  assert.equal(modulation.inhibitoryGain, 1);
  assert.equal(modulation.excitatoryBias, 0);
  assert.equal(modulation.inhibitoryBias, 0);
  assert.equal(modulation.excitatoryGain, 1);
  const withOtherTarget = modulationFromTargets({ GABAA: diazepam(10), HT2A: { delta: 0.2 } });
  close(withOtherTarget.excitatoryBias, 0.8);
});

test('inhibitory event decays to 25% at calibrated duration while paired control retains reference kinetics', () => {
  const network = new NeuralSimulation({ excitatoryCount: 1, inhibitoryCount: 0, connectionProbability: 0, noiseAmplitude: 0, excitatoryInput: 0 });
  network.setTargets({ GABAA: diazepam(10) });
  network.neurons[0].synI = 1;
  network.baselineNeurons[0].synI = 1;
  network.advance(63);
  close(network.neurons[0].synI, 0.25);
  close(network.baselineNeurons[0].synI, Math.exp(-63 / BASELINE_INHIBITION_DECAY_MS));
  assert.equal(network.stats.totalSpikes, 0);
});

test('calibrated checkpoints replay exactly and legacy missing decay uses finite reference fallback', () => {
  const original = new NeuralSimulation({ seed: 532 });
  original.setTargets({ GABAA: diazepam(100) });
  original.advance(311.7);
  const saved = JSON.parse(JSON.stringify(original.snapshot()));
  const replay = new NeuralSimulation().restore(saved);
  original.advance(400); replay.advance(400);
  assert.deepEqual(replay.snapshot(), original.snapshot());
  delete saved.modulation.inhibitionDecayMs;
  delete saved.modulation.inhibitionEvidence;
  const legacy = new NeuralSimulation().restore(saved);
  assert.equal(legacy.modulation.inhibitionDecayMs, BASELINE_INHIBITION_DECAY_MS);
  assert.match(legacy.stats.migrationNote, /not an exact replay/);
  const migrationNote = legacy.stats.migrationNote;
  legacy.setTargets({ GABAA: diazepam(100) });
  legacy.advance(100);
  assert.equal(legacy.stats.migrationNote, migrationNote);
  const migratedAgain = new NeuralSimulation().restore(JSON.parse(JSON.stringify(legacy.snapshot())));
  assert.equal(migratedAgain.stats.migrationNote, migrationNote);
  migratedAgain.reset();
  assert.equal(migratedAgain.stats.migrationNote, null);
  assert.ok(legacy.neurons.every(n => Number.isFinite(n.v) && Number.isFinite(n.synI)));
  saved.modulation.inhibitionDecayMs = -1;
  assert.throws(() => new NeuralSimulation().restore(saved), RangeError);
});
