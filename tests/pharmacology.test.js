import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PharmacologySimulation, computeTargets, propagateTwoCompartment, PK_DT_HOURS } from '../src/pharmacology.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/compound-catalog.json', import.meta.url)));
const simple = (id, targets = [], extra = {}) => ({ id, name: id, targets, pk: { halfLifeH: 10, freeFraction: 0.5, brainPartition: 1, brainEquilibrationH: 0.25 }, metabolism: { substrate: [], inhibits: [] }, ...extra });

test('exact compartment exchange conserves mass without elimination and approaches partition equilibrium', () => {
  const result = propagateTwoCompartment(300, 0, { ke: 0, kPB: 1, kBP: 2 }, 10);
  assert.ok(Math.abs(result.plasmaAmount + result.brainAmount - 300) < 1e-10);
  assert.ok(Math.abs(result.brainAmount - 100) < 1e-8);
  assert.ok(result.eliminatedAmount < 1e-10);
});

test('linear propagator remains nonnegative, eliminates mass, and obeys its semigroup', () => {
  const rates = { ke: 0.23, kPB: 0.7, kBP: 3.1 };
  const full = propagateTwoCompartment(27, 73, rates, 2);
  const half = propagateTwoCompartment(27, 73, rates, 1);
  const twice = propagateTwoCompartment(half.plasmaAmount, half.brainAmount, rates, 1);
  assert.ok(Math.abs(full.plasmaAmount - twice.plasmaAmount) < 1e-12);
  assert.ok(Math.abs(full.brainAmount - twice.brainAmount) < 1e-12);
  for (const duration of [0, 0.000001, 0.1, 10, 1000, 1e6]) {
    const r = propagateTwoCompartment(27, 73, rates, duration);
    assert.ok(r.plasmaAmount >= 0 && r.brainAmount >= 0 && r.eliminatedAmount >= 0);
    assert.ok(Math.abs(r.plasmaAmount + r.brainAmount + r.eliminatedAmount - 100) < 1e-10);
  }
});

test('catalog profiles are supported explicitly; B12 and unknown structures get no invented acute actions', () => {
  const pk = new PharmacologySimulation(catalog);
  assert.equal(pk.addExposure('cyanocobalamin').supported, false);
  assert.equal(pk.addExposure('unknown-smiles').supported, false);
  assert.equal(pk.stats.exposures.length, 0);
  const baseline = pk.stats.targets;
  pk.advance(1);
  assert.deepEqual(pk.stats.targets, baseline);
  for (const profile of catalog.compounds.filter(p => p.simulationSupported !== false)) assert.equal(pk.addExposure(profile.id, 100).supported, true, profile.id);
});

test('exposure adds plasma amount before brain distribution, repeated exposures sum correctly', () => {
  const pk = new PharmacologySimulation([simple('x')]);
  pk.addExposure('x', 100);
  assert.equal(pk.stats.exposures[0].plasmaNM, 100);
  assert.equal(pk.stats.exposures[0].brainNM, 0);
  assert.equal(pk.stats.exposures[0].initialAmountNMol, 300);
  pk.addExposure('x', 50);
  assert.equal(pk.stats.exposures.length, 1);
  assert.equal(pk.stats.exposures[0].plasmaNM, 150);
  assert.equal(pk.stats.ledger.length, 2);
  pk.advance(0.5);
  assert.ok(pk.stats.exposures[0].brainNM > 0);
  assert.ok(pk.stats.exposures[0].plasmaNM < 150);
});

test('all compartments, elimination, withdrawal and re-exposure retain global mass balance', () => {
  const pk = new PharmacologySimulation(catalog);
  pk.addExposure('escitalopram', 100);
  pk.addExposure('aripiprazole', 100);
  pk.addExposure('bupropion', 1000);
  for (let i = 0; i < 20; i++) {
    pk.advance(2);
    if (i === 3) pk.addExposure('escitalopram', 27);
    if (i === 7) pk.removeExposure('aripiprazole');
    if (i === 12) pk.addExposure('aripiprazole', 17);
    assert.ok(Math.abs(pk.stats.massBalance.errorNMol) < 1e-7);
    for (const e of pk.stats.exposures) assert.ok(e.plasmaNM >= 0 && e.brainNM >= 0 && e.eliminatedNMol >= 0);
  }
  assert.ok(pk.stats.massBalance.removedNMol > 0);
  assert.equal(pk.stats.ledger.filter(e => e.type === 'remove').length, 1);
});

test('calibrated terminal half-life matches the slow mode after distribution', () => {
  const pk = new PharmacologySimulation([simple('x')]);
  pk.addExposure('x', 100);
  pk.advance(10);
  const before = pk.stats.exposures[0];
  assert.equal(before.terminalHalfLifeCalibrated, true);
  pk.advance(10);
  assert.ok(Math.abs(pk.stats.exposures[0].plasmaNM / before.plasmaNM - 0.5) < 1e-10);
});

test('competitive target occupancies sum within one and partial agonism depends on endogenous tone', () => {
  const profiles = [simple('partial', [{ target: 'D2', kiNM: 10, action: 'partial_agonist', efficacy: 0.25 }]), simple('antagonist', [{ target: 'D2', kiNM: 10, action: 'antagonist', efficacy: 0 }])];
  const low = computeTargets([{ id: 'partial', brainNM: 1000 }], profiles, { D2: 0.01 }).D2;
  const high = computeTargets([{ id: 'partial', brainNM: 1000 }], profiles, { D2: 4 }).D2;
  assert.ok(low.delta > 0);
  assert.ok(high.delta < 0);
  const mixture = computeTargets([{ id: 'partial', brainNM: 100 }, { id: 'antagonist', brainNM: 100 }], profiles, { D2: 1 }).D2;
  assert.equal(mixture.contributors.length, 2);
  assert.ok(Math.abs(mixture.contributors.reduce((n, c) => n + c.occupancy, 0) - 20 / 22) < 1e-12);
  assert.ok(mixture.occupancy <= 1 && mixture.activity <= 1 && mixture.activity >= 0);
  const withoutCompetitor = computeTargets([{ id: 'partial', brainNM: 100 }], profiles, { D2: 1 }).D2;
  assert.ok(mixture.contributors[0].occupancy < withoutCompetitor.contributors[0].occupancy);
});

test('GABAA positive allosteric modulation requires endogenous drive', () => {
  const profiles = [simple('pam', [{ target: 'GABAA', kiNM: 10, action: 'pam', efficacy: 1 }])];
  const noGaba = computeTargets([{ id: 'pam', brainNM: 100 }], profiles, { GABAA: 0 }).GABAA;
  const withGaba = computeTargets([{ id: 'pam', brainNM: 100 }], profiles, { GABAA: 1 / 3 }).GABAA;
  assert.equal(noGaba.activity, 0);
  assert.ok(withGaba.activity > withGaba.baselineActivity);
  assert.equal(withGaba.contributors[0].site, 'allosteric');
});

test('bupropion CYP2D6 inhibition increases aripiprazole exposure with explicit illustrative assumptions', () => {
  const solo = new PharmacologySimulation(catalog), mixture = new PharmacologySimulation(catalog);
  solo.addExposure('aripiprazole', 100);
  mixture.addExposure('aripiprazole', 100);
  mixture.addExposure('bupropion', 10000);
  solo.advance(48); mixture.advance(48);
  const ari = mixture.stats.exposures.find(e => e.id === 'aripiprazole');
  assert.ok(ari.plasmaNM > solo.stats.exposures[0].plasmaNM * 1.05);
  assert.ok(ari.clearanceFactor < 1 && ari.clearanceFactor >= 0.5);
  assert.ok(mixture.stats.interactions.some(i => i.substrateId === 'aripiprazole' && i.inhibitorIds.includes('bupropion')));
  assert.ok(mixture.stats.interactions[0].evidence.includes('illustrative'));
});

test('CYP-varying fixed-step solution converges when the step is halved', () => {
  const create = stepHours => {
    const pk = new PharmacologySimulation(catalog, { stepHours });
    pk.addExposure('aripiprazole', 100); pk.addExposure('bupropion', 1000); pk.advance(24);
    return pk.stats.exposures.find(e => e.id === 'aripiprazole').plasmaNM;
  };
  const coarse = create(PK_DT_HOURS), fine = create(PK_DT_HOURS / 2), finer = create(PK_DT_HOURS / 4);
  assert.ok(Math.abs(coarse - fine) / finer < 1e-5);
  assert.ok(Math.abs(fine - finer) < Math.abs(coarse - fine));
});

test('frame partition and checkpoint replay preserve PK, compound profiles and target states', () => {
  const a = new PharmacologySimulation(catalog), b = new PharmacologySimulation(catalog);
  a.addExposure('escitalopram', 100); b.addExposure('escitalopram', 100);
  a.advance(2); for (let i = 0; i < 120; i++) b.advance(1 / 60);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.registerCompound(simple('custom-cid', [{ target: 'SERT', kiNM: 12, action: 'inhibitor', efficacy: 0 }]));
  a.addExposure('custom-cid', 100); a.advance(0.002);
  const saved = JSON.parse(JSON.stringify(a.snapshot()));
  const restored = new PharmacologySimulation([]).restore(saved);
  a.advance(1.431); restored.advance(1.431);
  assert.deepEqual(a.snapshot(), restored.snapshot());
  assert.deepEqual(a.stats.targets, restored.stats.targets);
});

test('custom profiles require explicit valid parameters; malformed profiles and time are rejected', () => {
  const pk = new PharmacologySimulation([]);
  assert.equal(pk.registerCompound({ id: 'structure-only', name: 'Unknown molecule' }).supported, false);
  assert.equal(pk.addExposure('structure-only').supported, false);
  assert.throws(() => pk.registerCompound(simple('bad', [{ target: 'D2', kiNM: -1, action: 'antagonist' }])), RangeError);
  assert.throws(() => pk.registerCompound(simple('bad', [{ target: 'D2', kiNM: 1, action: 'partial_agonist' }])), TypeError);
  assert.throws(() => pk.registerCompound(simple('bad', [], { pk: { halfLifeH: 0 } })), RangeError);
  for (const value of [-1, NaN, Infinity]) assert.throws(() => pk.advance(value), RangeError);
});

test('quantitative target/action combinations cannot silently contradict their stated mechanisms', () => {
  const pk = new PharmacologySimulation([]);
  const rejects = [
    { target: 'SERT', action: 'agonist', efficacy: 1 },
    { target: 'DAT', action: 'pam', efficacy: 1 },
    { target: 'NET', action: 'inhibitor', efficacy: 0.4 },
    { target: 'D2', action: 'inhibitor', efficacy: 0 },
    { target: 'D2', action: 'antagonist', efficacy: 1 },
    { target: 'NMDA', action: 'channel_blocker', efficacy: 0.4 },
    { target: 'HT2A', action: 'agonist', efficacy: 0.4 },
    { target: 'GABAA', action: 'pam', efficacy: 0.6 },
    { target: 'D2', action: 'cofactor', efficacy: 0 },
    { target: 'UNKNOWN_RECEPTOR', action: 'antagonist', efficacy: 0 },
  ];
  for (const definition of rejects) {
    assert.throws(() => pk.registerCompound(simple('invalid', [{ ...definition, kiNM: 10 }])), undefined, `${definition.target} / ${definition.action}`);
    assert.equal(pk.compounds.has('invalid'), false, 'invalid profiles must not be partially registered');
  }
  for (const [index, definition] of [
    { target: 'SERT', action: 'inhibitor', efficacy: 0 },
    { target: 'D2', action: 'antagonist', efficacy: 0 },
    { target: 'NACHR', action: 'agonist', efficacy: 1 },
    { target: 'HT2A', action: 'partial_agonist', efficacy: 0.4 },
    { target: 'HT1A', action: 'pam', efficacy: 1 },
    { target: 'NMDA', action: 'channel_blocker', efficacy: 0 },
  ].entries()) assert.equal(pk.registerCompound(simple(`valid-${index}`, [{ ...definition, kiNM: 10 }])).supported, true);
});
