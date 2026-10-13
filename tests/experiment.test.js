import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Experiment, EXPERIMENT_DT_SECONDS } from '../src/experiment.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/compound-catalog.json', import.meta.url)));
const make = () => new Experiment(catalog);

test('controller exposes independent clock ratios and freezes only systemic time when requested', () => {
  const e = make();
  e.advance(2);
  assert.equal(e.timeSeconds, 2);
  assert.equal(e.pk.timeHours, 1);
  assert.equal(e.neural.timeMs, 50);
  assert.equal(e.brain.timeMs + e.brain.accumulator, 50);
  assert.equal(e.cognition.timeSeconds, 2);
  assert.equal(e.synapse.time, 2);
  e.advanceSystemic = false;
  e.advance(2);
  assert.equal(e.pk.timeHours, 1);
  assert.equal(e.neural.timeMs, 100);
  assert.equal(e.brain.timeMs + e.brain.accumulator, 100);
  assert.equal(e.cognition.timeSeconds, 4);
  assert.equal(e.synapse.time, 4);
});

test('fixed controller ticks are independent of render-frame partitions', () => {
  const a = make(), b = make();
  a.addExposure('escitalopram', 100); b.addExposure('escitalopram', 100);
  a.advance(3);
  for (let i = 0; i < 180; i++) b.advance(1 / 60);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(a.checkpoints, b.checkpoints);
  assert.equal(a.advance(0), 0);
});

test('mixture functional capacity drives the legacy SERT reservoir; withdrawal preserves the clocks', () => {
  const e = make();
  e.addExposure('escitalopram', 100); e.addExposure('fluoxetine', 100); e.addExposure('aripiprazole', 100);
  e.advance(2);
  const capacity = e.pk.stats.targets.SERT.activity;
  assert.ok(capacity > 0 && capacity < 1);
  assert.ok(Math.abs(1 / (1 + e.synapse.params.drugConcentration) - capacity) < 1e-12);
  const t = e.timeSeconds;
  assert.equal(e.removeExposure('aripiprazole'), true);
  assert.equal(e.pk.stats.exposures.length, 2);
  e.clearExposures();
  assert.equal(e.pk.stats.exposures.length, 0);
  assert.equal(e.timeSeconds, t);
  assert.equal(e.synapse.params.drugConcentration, 0);
  assert.ok(e.pk.stats.massBalance.removedNMol > 0);
});

test('qualitative B12 annotations do not invent PK values, receptor occupancy or acute network effects', () => {
  const withB12 = make(), control = make();
  const response = withB12.addExposure('cyanocobalamin', 1);
  assert.equal(response.supported, true);
  assert.equal(response.qualitative, true);
  assert.equal(withB12.qualitative.length, 1);
  assert.equal(withB12.pk.stats.exposures.length, 0);
  withB12.advance(3); control.advance(3);
  assert.deepEqual(withB12.pk.snapshot(), control.pk.snapshot());
  assert.deepEqual(withB12.neural.snapshot(), control.neural.snapshot());
  assert.deepEqual(withB12.brain.snapshot(), control.brain.snapshot());
  assert.deepEqual(withB12.cognition.snapshot(), control.cognition.snapshot());
  assert.deepEqual(withB12.synapse.snapshot(), control.synapse.snapshot());
  assert.equal(withB12.qualitative[0].initialPlasmaNM, 1);
  assert.equal(withB12.removeExposure('cyanocobalamin'), true);
  assert.equal(withB12.qualitative.length, 0);
});

test('seeking saves the unsampled live tail and reproduces its exact state', () => {
  const e = make();
  e.addExposure('escitalopram', 100);
  e.advance(3.35);
  const live = e.snapshot();
  e.seek(1.2);
  assert.equal(e.atHistory, true);
  assert.equal(e.latestTime, 3.35);
  e.seek(3.35);
  assert.equal(e.atHistory, false);
  assert.deepEqual(e.snapshot(), live);
});

test('historical replay reproduces future then branches deterministically on an edit', () => {
  const e = make();
  e.addExposure('escitalopram', 100); e.advance(4);
  e.seek(1.5);
  const historical = e.snapshot();
  const branch = make().restore(historical);
  e.addExposure('aripiprazole', 100); branch.addExposure('aripiprazole', 100);
  assert.equal(e.atHistory, false);
  assert.equal(e.latestTime, 1.5);
  assert.ok(e.checkpoints.every(c => c.timeSeconds <= 1.5));
  e.advance(1.5); branch.advance(1.5);
  assert.deepEqual(e.snapshot(), branch.snapshot());
});

test('same-timestamp edits coalesce checkpoints and reset clears clocks/exposures', () => {
  const e = make();
  for (let i = 0; i < 50; i++) e.addExposure('escitalopram', 1);
  assert.equal(e.checkpoints.length, 1);
  assert.equal(e.history.length, 1);
  assert.equal(e.pk.stats.exposures[0].plasmaNM, 50);
  e.advance(2); e.reset();
  assert.equal(e.timeSeconds, 0);
  assert.equal(e.pk.stats.exposures.length, 0);
  assert.equal(e.synapse.time, 0);
  assert.equal(e.neural.timeMs, 0);
  assert.equal(e.brain.timeMs, 0);
  assert.equal(e.cognition.timeSeconds, 0);
});

test('rolling history retains only 120 seconds plus the preceding reconstruction checkpoint', () => {
  const e = make();
  e.advance(123.2);
  assert.ok(e.earliestTime >= e.timeSeconds - 121.1);
  assert.ok(e.checkpoints.length <= 123);
  assert.ok(e.history.length <= 123);
  assert.throws(() => e.seek(0), RangeError);
  e.seek(4.15);
  assert.ok(Math.abs(e.timeSeconds - 4.15) < 1e-10);
});

test('export/import restores custom profiles, qualitative annotations and complete future random evolution', () => {
  const e = make();
  e.registerCompound({ id: 'custom-cid-123', name: 'Explicit hypothetical ligand', targets: [{ target: 'SERT', kiNM: 10, action: 'inhibitor', efficacy: 0 }], pk: { halfLifeH: 12, freeFraction: 0.4, brainPartition: 1, brainEquilibrationH: 0.25 } });
  e.addExposure('custom-cid-123', 100); e.addExposure('cyanocobalamin', 1); e.advance(2.137);
  const imported = make().importJSON(JSON.stringify(e.exportJSON()));
  assert.equal(imported.checkpoints.length, 1);
  assert.ok(imported.pk.compounds.has('custom-cid-123'));
  assert.deepEqual(imported.snapshot(), e.snapshot());
  e.advance(1.273); imported.advance(1.273);
  assert.deepEqual(imported.snapshot(), e.snapshot());
});

test('restore/import preserve engine object identities held by the renderer', () => {
  const e = make();
  const refs = [e.pk, e.neural, e.synapse, e.brain, e.cognition];
  e.addExposure('escitalopram', 100); e.advance(1);
  const saved = e.exportJSON();
  e.advance(1); e.importJSON(saved);
  assert.equal(e.pk, refs[0]); assert.equal(e.neural, refs[1]); assert.equal(e.synapse, refs[2]);
  assert.equal(e.brain, refs[3]); assert.equal(e.cognition, refs[4]);
  e.setAdvanceSystemic(false);
  assert.equal(e.advanceSystemic, false);
});

test('malformed imports reject atomically without destroying current state or replay history', () => {
  const e = make();
  e.addExposure('escitalopram', 100); e.advance(2);
  const original = e.exportJSON(), originalHistory = structuredClone(e.history);
  const mutations = [
    x => { x.state.timeSeconds = NaN; },
    x => { x.state.pk.records.escitalopram.id = 'unknown'; },
    x => { x.state.pk.records.escitalopram.plasmaAmountNMol = -1; },
    x => { x.state.neural.neurons.pop(); },
    x => { x.state.neural.neurons[0].v = Infinity; },
    x => { x.state.neural.connections[0].to = 9999; },
    x => { x.state.synapse.particles[0].state = 'made-up-species'; },
    x => { x.state.synapse.transporters.pop(); },
    x => { x.state.synapse.diffusionRandomState = -1; },
    x => { x.state.qualitative = [{ id: 'unknown', qualitative: true }]; },
    x => { x.state.pk.compounds[0].pk.halfLifeH = -1; },
    x => { x.state.brain.regions[0].e = Infinity; },
    x => { x.state.brain.timeMs += 0.5; },
    x => { x.state.brain.history.pop(); },
    x => { x.state.cognition.timeSeconds += 0.05; },
    x => { x.state.cognition.memories[0].strength = 9; },
  ];
  for (const mutate of mutations) {
    const corrupt = structuredClone(original); mutate(corrupt);
    assert.throws(() => e.importJSON(corrupt));
    assert.deepEqual(e.exportJSON(), original);
    assert.deepEqual(e.history, originalHistory);
  }
  assert.throws(() => e.importJSON('{'), SyntaxError);
  assert.throws(() => e.importJSON({ format: 'unknown' }), TypeError);
});

test('regional model and symbolic workspace replay together, including recorded response provenance', () => {
  const e = make();
  e.addExposure('lsd', 100); e.receiveMessage('Remember that the abstract symbol is blue.');
  e.recordResponse({ text: 'The recorded abstract symbol is blue.', mode: 'state-inspector', contextSummary: 'Retrieved user statement.' });
  e.advance(4.35);
  const live = e.snapshot();
  assert.ok(Math.abs(e.brain.stats.activityDelta) > 1e-4);
  assert.ok(e.cognition.stats.cycles > 0);
  e.seek(1.2); e.seek(4.35);
  assert.deepEqual(e.snapshot(), live);
  assert.equal(e.cognition.stats.messages[1].mode, 'state-inspector');
  e.seek(2); e.receiveMessage('Focus on comparison now.');
  assert.equal(e.latestTime, 2);
  assert.equal(e.cognition.stats.focus, 'Focus on comparison now.');
  e.setAutonomous(false); e.advance(2);
  assert.equal(e.cognition.stats.autonomous, false);
  assert.equal(e.cognition.stats.focus, 'Focus on comparison now.');
});

test('old experiment files initialize missing regional and cognitive state without fabricating past events', () => {
  const old = make(); old.addExposure('escitalopram', 100); old.advance(3.35);
  const serialized = old.exportJSON(); delete serialized.state.brain; delete serialized.state.cognition;
  const a = make().importJSON(serialized), b = make().importJSON(serialized);
  assert.equal(a.brain.timeMs + a.brain.accumulator, a.neural.timeMs);
  assert.equal(a.cognition.timeSeconds, a.timeSeconds);
  assert.match(a.brain.stats.migrationNote, /earlier regional history was not recorded/);
  assert.equal(a.cognition.stats.events.length, 1);
  assert.equal(a.cognition.stats.events[0].kind, 'imported');
  assert.equal(a.cognition.stats.messages.length, 0);
  a.advance(1); b.advance(1);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('invalid inputs do not advance or silently create inferred compound behavior', () => {
  const e = make();
  assert.equal(e.addExposure('unregistered-cid', 100).supported, false);
  assert.equal(e.pk.stats.exposures.length, 0);
  for (const value of [-1, NaN, Infinity]) assert.throws(() => e.advance(value), RangeError);
  assert.throws(() => e.addExposure('escitalopram', 1e7), RangeError);
  assert.throws(() => { e.advanceSystemic = 'yes'; }, TypeError);
  e.advance(EXPERIMENT_DT_SECONDS / 2);
  assert.equal(e.timeSeconds, 0);
  e.advance(EXPERIMENT_DT_SECONDS / 2);
  assert.equal(e.timeSeconds, EXPERIMENT_DT_SECONDS);
});
