import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { functionalResponse, validateFunctionalAssay } from '../src/functional-response.js';
import { computeTargets, validateCompound } from '../src/pharmacology.js';
import { Experiment } from '../src/experiment.js';

const catalog = JSON.parse(readFileSync(new URL('../public/data/compound-catalog.json', import.meta.url)));
const profiles = new Map(catalog.compounds.map(p => [p.id, p]));
const measured = catalog.compounds.flatMap(p => p.targets.filter(t => t.functionalAssay).map(t => ({ p, t, a: t.functionalAssay })));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('curated response curves include experimental endpoint, units, context, and resolvable sources', () => {
  assert.ok(measured.length >= 7, 'expected functional evidence for multiple drug classes');
  for (const { p, t, a } of measured) {
    assert.doesNotThrow(() => validateCompound(p), `${p.id}/${t.target}`);
    assert.ok(a.sourceIds.every(id => p.sources.some(s => s.id === id && /^https:\/\//.test(s.url))));
    assert.ok(a.notes, 'assay transfer limitations must be recorded');
    assert.ok(['EC50', 'IC50'].includes(a.midpointType));
    assert.ok(a.hillEvidence && a.maxResponseEvidence);
  }
});

test('experimental curves recover half maximal endpoint at the reported midpoint and remain bounded', () => {
  for (const { a } of measured) {
    near(functionalResponse(0, a), 0);
    near(functionalResponse(a.midpointNM, a), a.maxResponse / 2);
    let previous = -1;
    for (const c of [1e-300, a.midpointNM / 10, a.midpointNM, a.midpointNM * 10, 1e300]) {
      const response = functionalResponse(c, a);
      assert.ok(Number.isFinite(response) && response >= previous && response <= a.maxResponse);
      previous = response;
    }
    near(previous, a.maxResponse);
  }
});

test('functional potency drives activity independently of the binding occupancy model', () => {
  for (const { p, t, a } of measured) {
    const withoutAssays = structuredClone(p);
    withoutAssays.targets.forEach(target => delete target.functionalAssay);
    const exposure = [{ id: p.id, brainNM: a.midpointNM }];
    const current = computeTargets(exposure, [p])[t.target];
    const previous = computeTargets(exposure, [withoutAssays])[t.target];
    near(current.occupancy, previous.occupancy);
    const changedBinding = structuredClone(p);
    changedBinding.targets.find(target => target.target === t.target).kiNM *= 3;
    const changed = computeTargets(exposure, [changedBinding])[t.target];
    near(changed.activity, current.activity);
    assert.notEqual(changed.occupancy, current.occupancy, 'changing Ki affects occupancy but not the functional endpoint');
    near(current.functionalResponses[0].assayResponse, a.maxResponse / 2);
    assert.match(current.responseBasis, /estimated transfer/);
  }
});

test('LSD human calcium endpoint and aripiprazole functional endpoints replace their old efficacy guesses', () => {
  const lsd = profiles.get('lsd');
  const a = lsd.targets.find(t => t.target === 'HT2A').functionalAssay;
  near(a.midpointNM, 1.52); near(a.maxResponse, 0.94);
  const result = computeTargets([{ id: 'lsd', brainNM: 1.52 }], [lsd], { HT2A: 0 }).HT2A;
  near(result.activity, 0.47);
  // Zero endogenous drive isolates the assay endpoint; this is not human firing.
  const ari = profiles.get('aripiprazole');
  for (const target of ['D2', 'HT1A']) {
    const assay = ari.targets.find(t => t.target === target).functionalAssay;
    const result = computeTargets([{ id: ari.id, brainNM: assay.midpointNM }], [ari], { [target]: 0 })[target];
    near(result.activity, assay.maxResponse / 2);
  }
});

test('uptake IC50 gives half modeled uptake inhibition without being treated as a binding Ki', () => {
  const bupropion = profiles.get('bupropion');
  for (const target of ['DAT', 'NET']) {
    const definition = bupropion.targets.find(t => t.target === target);
    const result = computeTargets([{ id: bupropion.id, brainNM: definition.functionalAssay.midpointNM }], [bupropion])[target];
    near(result.activity, 0.5);
    assert.match(result.occupancyEvidence, /Estimated binding proxy/);
  }
});

test('measured PAM potentiation still requires GABA and channel inhibition stays in its own pool', () => {
  const p = profiles.get('diazepam'), a = p.targets[0].functionalAssay;
  const exposure = [{ id: p.id, brainNM: a.midpointNM }];
  near(computeTargets(exposure, [p], { GABAA: 0 }).GABAA.activity, 0);
  const result = computeTargets(exposure, [p], { GABAA: 1 / 3 }).GABAA;
  near(result.activity, 0.25 * (1 + a.maxResponse / 2));
  const k = profiles.get('ketamine'), ka = k.targets[0].functionalAssay;
  const inhibited = computeTargets([{ id: k.id, brainNM: ka.midpointNM }], [k]).NMDA;
  near(inhibited.activity / inhibited.baselineActivity, 0.5);
});

test('cross-assay mixture rule is bounded, order independent, and reduces agonist response under antagonism', () => {
  const exposures = [{ id: 'lsd', brainNM: 10 }, { id: 'aripiprazole', brainNM: 100 }];
  const mixture = computeTargets(exposures, catalog);
  assert.deepEqual(mixture.HT2A.activity, computeTargets(exposures.toReversed(), catalog).HT2A.activity);
  assert.ok(mixture.HT2A.activity < computeTargets([exposures[0]], catalog).HT2A.activity);
  for (const state of Object.values(mixture)) assert.ok(state.activity >= 0 && state.activity <= 1);
  assert.match(mixture.HT2A.responseBasis, /estimated/);
});

test('functional profile validation rejects mismatched quantities and missing provenance', () => {
  const source = profiles.get('lsd');
  for (const change of [a => a.midpointNM = -1, a => a.midpointType = 'Ki', a => a.kind = 'channel_inhibition', a => a.hillSlope = NaN, a => a.maxResponse = 2, a => a.species = '', a => a.sourceIds = ['missing-source']]) {
    const p = structuredClone(source);
    change(p.targets.find(t => t.target === 'HT2A').functionalAssay);
    assert.throws(() => validateCompound(p));
  }
  assert.throws(() => validateFunctionalAssay({}, 'partial_agonist'));
});

test('custom assay profiles remain unverified hypotheses and cannot select a curated synaptic calibration', () => {
  const profile = structuredClone(profiles.get('diazepam'));
  profile.custom = true;
  const result = computeTargets([{ id: profile.id, brainNM: 100 }], [profile]).GABAA;
  assert.match(result.responseBasis, /user-supplied/);
  assert.match(result.functionalResponses[0].evidenceBasis, /not independently verified/);
  assert.equal(result.contributors[0].neuralCalibrationId, undefined);
});

test('introducing an infinitesimal assay ligand does not discontinuously change an existing binding-only response', () => {
  const antagonist = { id: 'blocker', name: 'Estimated antagonist', targets: [{ target: 'D2', action: 'antagonist', kiNM: 1, efficacy: 0 }] };
  const entries = [profiles.get('aripiprazole'), antagonist];
  const simulate = brainNM => computeTargets([{ id: 'blocker', brainNM: 1 }, { id: 'aripiprazole', brainNM }], entries).D2.activity;
  near(simulate(0), simulate(1e-15));
});

test('synapse equivalent reservoir follows functional SERT capacity rather than an illustrative binding affinity', () => {
  const e = new Experiment(catalog);
  e.addExposure('fluoxetine', 100); e.advance(1);
  near(1 / (1 + e.synapse.params.drugConcentration), e.pk.stats.targets.SERT.activity);
});

test('new assay and neural effects survive experiment export/import and deterministic continuation', () => {
  const a = new Experiment(catalog);
  a.addExposure('lsd', 20); a.addExposure('diazepam', 200);
  a.advance(1.15);
  const b = new Experiment(catalog);
  b.importJSON(JSON.parse(JSON.stringify(a.exportJSON())));
  a.advance(0.65); b.advance(0.65);
  assert.deepEqual(a.pk.stats.targets, b.pk.stats.targets);
  assert.deepEqual(a.neural.snapshot(), b.neural.snapshot());
  assert.deepEqual(a.brain.snapshot(), b.brain.snapshot());
});
