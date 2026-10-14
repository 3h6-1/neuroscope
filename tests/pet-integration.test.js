import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PharmacologySimulation, computeTargets, validateCompound, PK_DT_HOURS } from '../src/pharmacology.js';
import { ARIPIPRAZOLE_PET_CALIBRATION } from '../src/pet-occupancy.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/compound-catalog.json', import.meta.url)));
const profile = catalog.compounds.find(p => p.id === 'aripiprazole');
const originalProfile = () => {
  const copy = structuredClone(profile);
  for (const target of copy.targets) delete target.occupancyCalibration;
  return copy;
};
const create = (stepHours = PK_DT_HOURS, profiles = [profile]) => {
  const pk = new PharmacologySimulation(profiles, { stepHours });
  pk.addExposure('aripiprazole', 100);
  return pk;
};

test('the shipped catalog applies the published PET calibration only to aripiprazole D2', () => {
  const calibrated = catalog.compounds.flatMap(p => p.targets.filter(t => t.occupancyCalibration).map(t => [p.id, t.target]));
  assert.deepEqual(calibrated, [['aripiprazole', 'D2']]);
  assert.deepEqual(profile.targets[0].occupancyCalibration, ARIPIPRAZOLE_PET_CALIBRATION);
  assert.equal(profile.targets[0].kiNM, 0.34);
  assert.equal(profile.targets[0].functionalAssay.midpointNM, 38);
});

test('virtual boluses do not instantly change the PET effect compartment', () => {
  const pk = create();
  const initial = pk.stats;
  assert.equal(initial.exposures[0].plasmaNM, 100);
  assert.equal(initial.exposures[0].effectSiteNM.D2, 0);
  assert.equal(initial.targets.D2.occupancy, 0);
  pk.advance(0.5);
  const after = pk.stats.exposures[0];
  assert.ok(after.effectSiteNM.D2 > 0 && after.effectSiteNM.D2 < after.plasmaNM);
  assert.ok(after.effectSiteNM.D2 > after.brainNM, 'total-plasma-equivalent signal is distinct from free brain concentration');
  pk.addExposure('aripiprazole', 200);
  assert.equal(pk.stats.exposures[0].effectSiteNM.D2, after.effectSiteNM.D2);
  assert.ok(Math.abs(pk.stats.exposures[0].plasmaNM - after.plasmaNM - 200) < 1e-10);
  pk.advance(0.5);
  assert.ok(pk.stats.exposures[0].effectSiteNM.D2 > after.effectSiteNM.D2);
});

test('PET occupancy reproduces the empirical curve without counting endogenous competition twice', () => {
  const effectSiteNM = 8.63 * 1000 / profile.molecularWeight;
  for (const drive of [0, 2 / 3, 4]) {
    const d2 = computeTargets([{ id: profile.id, brainNM: 2, effectSiteNM: { D2: effectSiteNM } }], [profile], { D2: drive }).D2;
    assert.ok(Math.abs(d2.occupancy - 0.5) < 1e-12);
    assert.match(d2.occupancyEvidence, /PET/);
    assert.match(d2.occupancyEvidence, /mixture.*unvalidated/);
    assert.equal(d2.contributors[0].affinityNM, 0.34);
  }
});

test('PET displacement changes leave functional activation and uncalibrated targets untouched', () => {
  for (const brainNM of [0, 1e-12, 2, 50]) {
    for (const withAssay of [true, false]) {
      const p = structuredClone(profile);
      if (!withAssay) delete p.targets[0].functionalAssay;
      const exposure = { id: p.id, brainNM, effectSiteNM: { D2: 0 } };
      const before = computeTargets([exposure], [p]);
      exposure.effectSiteNM.D2 = 1000;
      const after = computeTargets([exposure], [p]);
      assert.ok(after.D2.occupancy > before.D2.occupancy);
      assert.equal(after.D2.activity, before.D2.activity, 'occupancy evidence must not become functional potency');
      assert.deepEqual(after.D2.functionalResponses, before.D2.functionalResponses);
      assert.deepEqual(after.HT1A, before.HT1A);
      assert.deepEqual(after.HT2A, before.HT2A);
    }
  }
});

test('PET interval-mean propagation converges when the timestep is halved', () => {
  const output = stepHours => {
    const pk = create(stepHours);
    pk.advance(6);
    return pk.stats.exposures[0].effectSiteNM.D2;
  };
  const coarse = output(PK_DT_HOURS), fine = output(PK_DT_HOURS / 2), finer = output(PK_DT_HOURS / 4);
  assert.ok(Math.abs(coarse - fine) / finer < 1e-7);
  assert.ok(Math.abs(fine - finer) < Math.abs(coarse - fine));
});

test('saturated PET concentrations and competitive mixtures remain finite', () => {
  const competitor = { ...originalProfile(), id: 'competitor', name: 'competitor' };
  const result = computeTargets([
    { id: profile.id, brainNM: 1e100, effectSiteNM: { D2: 1e100 } },
    { id: competitor.id, brainNM: 1e100 },
  ], [profile, competitor]).D2;
  for (const value of [result.occupancy, result.activity, result.delta, ...result.contributors.map(c => c.occupancy)]) assert.ok(Number.isFinite(value));
  assert.ok(result.occupancy >= 0 && result.occupancy <= 1);
  assert.ok(result.activity >= 0 && result.activity <= 1);
  assert.ok(result.contributors.reduce((sum, c) => sum + c.occupancy, 0) <= 1);
});

test('the empirical effect compartment consumes no mass and changes no plasma kinetics', () => {
  const current = create(), original = create(PK_DT_HOURS, [originalProfile()]);
  current.advance(24); original.advance(24);
  for (const key of ['plasmaAmountNMol', 'brainAmountNMol', 'initialAmountNMol', 'eliminatedNMol', 'removedNMol']) {
    assert.equal(current.records.aripiprazole[key], original.records.aripiprazole[key]);
  }
  assert.deepEqual(current.stats.massBalance, original.stats.massBalance);
  assert.ok(Math.abs(current.stats.massBalance.errorNMol) < 1e-8);
  current.removeExposure('aripiprazole');
  assert.equal(current.records.aripiprazole.effectSiteNM.D2, 0);
  assert.equal(current.stats.targets.D2.occupancy, 0);
  assert.ok(Math.abs(current.stats.massBalance.errorNMol) < 1e-8);
});

test('serialized PET state preserves identical future evolution and occupancy', () => {
  const live = create(); live.advance(0.7);
  const encoded = JSON.parse(JSON.stringify(live.snapshot()));
  const restored = new PharmacologySimulation([]).restore(encoded);
  assert.deepEqual(restored.snapshot(), live.snapshot());
  live.addExposure('aripiprazole', 20); restored.addExposure('aripiprazole', 20);
  live.advance(3); restored.advance(3);
  assert.deepEqual(restored.snapshot(), live.snapshot());
  assert.deepEqual(restored.stats.targets.D2, live.stats.targets.D2);
});

test('malformed PET state is rejected atomically rather than silently resetting its history', () => {
  const live = create(); live.advance(0.2);
  const baseline = live.snapshot();
  for (const state of [undefined, null, [], {}, { D2: -1 }, { D2: NaN }, { D2: Infinity }, { D2: 10, SERT: 10 }]) {
    const malformed = structuredClone(baseline);
    malformed.records.aripiprazole.effectSiteNM = state;
    assert.throws(() => live.restore(malformed), /PET effect-site/);
    assert.deepEqual(live.snapshot(), baseline);
  }
});

test('older snapshots with original profiles and no PET state retain their original model', () => {
  const original = create(PK_DT_HOURS, [originalProfile()]); original.advance(0.2);
  const snapshot = original.snapshot();
  delete snapshot.records.aripiprazole.effectSiteNM;
  const restored = new PharmacologySimulation(catalog).restore(snapshot);
  original.advance(1); restored.advance(1);
  assert.equal(restored.stats.exposures[0].plasmaNM, original.stats.exposures[0].plasmaNM);
  assert.deepEqual(restored.stats.targets, original.stats.targets);
  assert.equal(restored.compounds.get('aripiprazole').targets[0].occupancyCalibration, undefined);
});

test('direct callers without PET history and custom profiles retain explicitly labeled binding approximations', () => {
  const exposure = { id: profile.id, brainNM: 1 };
  const legacy = computeTargets([exposure], [profile]).D2;
  assert.match(legacy.contributors[0].occupancyCalibrationUnavailable, /history not supplied/);
  const custom = { ...structuredClone(profile), custom: true };
  const result = computeTargets([{ ...exposure, effectSiteNM: { D2: 1000 } }], [custom]).D2;
  assert.equal(result.occupancy, legacy.occupancy);
  assert.equal(result.contributors[0].occupancyCalibration, undefined);
  assert.match(result.occupancyEvidence, /Estimated/);
});

test('replacing a removed custom profile with the curated profile initializes fresh PET state', () => {
  const pk = create(PK_DT_HOURS, [{ ...structuredClone(profile), custom: true }]);
  pk.advance(0.2); pk.removeExposure(profile.id);
  pk.registerCompound(profile); pk.addExposure(profile.id, 100);
  assert.deepEqual(pk.records.aripiprazole.effectSiteNM, { D2: 0 });
  pk.advance(0.1);
  assert.ok(pk.records.aripiprazole.effectSiteNM.D2 > 0);
});

test('PET profiles require a valid mass conversion and separate binding affinity', () => {
  for (const molecularWeight of [undefined, 0, -1, NaN]) assert.throws(() => validateCompound({ ...structuredClone(profile), molecularWeight }), /molecularWeight/);
  const missingAffinity = structuredClone(profile);
  delete missingAffinity.targets[0].kiNM;
  delete missingAffinity.targets[0].functionalAssay;
  assert.throws(() => validateCompound(missingAffinity), /binding affinity/);
});
