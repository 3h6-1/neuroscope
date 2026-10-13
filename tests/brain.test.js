import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BrainSimulation, REGIONS, CONNECTIONS, regionalModulation } from '../src/brain.js';
import { computeTargets } from '../src/pharmacology.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/compound-catalog.json', import.meta.url)));
const finitePopulations = brain => {
  for (const region of brain.regions) for (const key of ['e', 'i', 'baselineE', 'baselineI']) assert.ok(Number.isFinite(region[key]) && region[key] >= 0 && region[key] <= 1);
};

test('regional anatomy is explicit, bilateral where appropriate, and excludes primary sensory regions', () => {
  assert.equal(REGIONS.length, 30);
  const ids = new Set(REGIONS.map(r => r.id));
  assert.equal(ids.size, REGIONS.length);
  for (const region of REGIONS) {
    assert.equal(region.position.length, 3);
    assert.ok(region.position.every(Number.isFinite));
    assert.match(region.densityEvidence, /Assumed/);
    if (region.id.endsWith('_l')) {
      const counterpart = REGIONS.find(r => r.id === region.id.replace(/_l$/, '_r'));
      assert.equal(counterpart.position[0], -region.position[0]);
    }
    assert.ok(!/primary|visual|auditory|somatosensory|olfactory|gustatory/.test(region.id));
  }
  for (const edge of CONNECTIONS) {
    assert.ok(ids.has(edge.from) && ids.has(edge.to));
    assert.notEqual(edge.from, edge.to);
    assert.ok(edge.weight > 0 && edge.delayMs > 0);
  }
});

test('shared internal drives and stochastic background keep untreated populations exactly matched', () => {
  const brain = new BrainSimulation({ seed: 138 });
  brain.setDrive({ dlpfc_l: 0.7, hippocampus_r: 0.4 });
  brain.advance(2000);
  for (const r of brain.regions) { assert.equal(r.e, r.baselineE); assert.equal(r.i, r.baselineI); }
  assert.equal(brain.stats.activityDelta, 0);
  assert.deepEqual(brain.history, brain.baselineHistory);
  assert.ok(brain.regions.find(r => r.id === 'dlpfc_l').e > brain.regions.find(r => r.id === 'dlpfc_r').e);
  assert.ok(brain.stats.activityEntropy >= 0 && brain.stats.activityEntropy <= 1);
});

test('bounded E/I relaxation remains finite with strong mixed modulation and extreme allowed drives', () => {
  const brain = new BrainSimulation({ seed: 199, noiseAmplitude: 0.5, couplingStrength: 5 });
  brain.setTargets({ HT2A: { delta: 1 }, NACHR: { delta: 1 }, GABAA: { delta: 1 }, NMDA: { delta: -1 } });
  brain.setDrive(Object.fromEntries(REGIONS.map((r, i) => [r.id, i % 2 ? -3 : 3])));
  brain.advance(5000);
  finitePopulations(brain);
  assert.ok(brain.stats.regional.some(r => Math.abs(r.delta) > 0.01));
  assert.match(brain.stats.interpretation, /not consciousness/);
});

test('catalog LSD and GABA modulation alter assumed regional dynamics while paired controls remain equal', () => {
  const lsd = new BrainSimulation({ seed: 717 }), gaba = new BrainSimulation({ seed: 717 });
  lsd.setTargets(computeTargets([{ id: 'lsd', brainNM: 30 }], catalog));
  gaba.setTargets({ GABAA: { delta: 0.5 } });
  lsd.advance(1500); gaba.advance(1500);
  assert.ok(lsd.stats.activityDelta > 0.01);
  assert.ok(gaba.stats.activityDelta < -0.01);
  assert.equal(lsd.stats.baselineActivity, gaba.stats.baselineActivity);
  assert.ok(new Set(lsd.stats.regional.map(r => r.delta.toFixed(4))).size > 5);
  finitePopulations(lsd); finitePopulations(gaba);
});

test('cofactor metadata cannot invent an acute receptor effect', () => {
  assert.deepEqual(regionalModulation({ B12: { delta: 100 } }), regionalModulation({}));
  const targets = computeTargets([{ id: 'cyanocobalamin', brainNM: 1e6 }], catalog);
  const brain = new BrainSimulation(); brain.setTargets(targets); brain.advance(300);
  assert.equal(brain.stats.activityDelta, 0);
});

test('fixed substeps give identical complete state for different renderer partitions', () => {
  const a = new BrainSimulation({ seed: 827 }), b = new BrainSimulation({ seed: 827 });
  a.setTargets({ HT2A: { delta: 0.3 } }); b.setTargets({ HT2A: { delta: 0.3 } });
  a.advance(1000.25);
  for (let i = 0; i < 100; i++) b.advance(10);
  b.advance(0.25);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('smaller substeps converge for deterministic population equations with delayed coupling', () => {
  const run = dtMs => {
    const brain = new BrainSimulation({ dtMs, noiseAmplitude: 0 });
    brain.setTargets({ HT2A: { delta: 0.3 } }); brain.setDrive({ dlpfc_l: 0.3 }); brain.advance(200);
    return brain.regions.map(r => r.e);
  };
  const coarse = run(1), medium = run(0.5), fine = run(0.25);
  const error = x => Math.sqrt(x.reduce((sum, e, i) => sum + (e - fine[i]) ** 2, 0) / x.length);
  assert.ok(error(medium) < error(coarse));
  assert.ok(error(medium) < 0.003);
});

test('JSON checkpoint preserves delay buffers, held noise, pending input and exact future evolution', () => {
  const a = new BrainSimulation({ seed: 623 });
  a.setTargets({ NET: { activity: 0.2 } }); a.setDrive({ pcc_l: 0.8 }); a.advance(277.27);
  const b = new BrainSimulation().restore(JSON.parse(JSON.stringify(a.snapshot())));
  a.advance(911.53); b.advance(911.53);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.reset(623); assert.equal(a.timeMs, 0); assert.equal(a.stats.activityDelta, 0);
});

test('invalid state restoration is atomic and rejects identities, clocks, arrays and nonfinite values', () => {
  const brain = new BrainSimulation(); brain.advance(120.25);
  const original = brain.snapshot();
  const corruptions = [
    s => { s.regions[0].e = NaN; }, s => { s.regions[0].i = 1.1; }, s => { s.regions[0].id = 'retina'; },
    s => { s.regions.pop(); }, s => { s.timeMs += 1; }, s => { s.rngState = -1; },
    s => { s.history[0].pop(); }, s => { s.history[s.historyIndex][0] = 0.77; },
    s => { s.targets = { HT2A: { delta: Infinity } }; }, s => { s.drive = { unknown: 1 }; },
  ];
  for (const corrupt of corruptions) {
    const state = structuredClone(original); corrupt(state);
    assert.throws(() => brain.restore(state));
    assert.deepEqual(brain.snapshot(), original);
  }
  for (const ms of [-1, Infinity, NaN]) assert.throws(() => brain.advance(ms));
  assert.throws(() => new BrainSimulation({ dtMs: 0.3 }));
  assert.throws(() => brain.setDrive({ dlpfc_l: 4 }));
});
