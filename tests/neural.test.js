import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NeuralSimulation, integrateNeuron, modulationFromTargets } from '../src/neural.js';
import { computeTargets } from '../src/pharmacology.js';

test('Izhikevich threshold generates a spike, resets voltage and increments recovery', () => {
  const n = { v: 29, u: -13, a: 0.02, b: 0.2, c: -65, d: 8, spikeCount: 0, lastSpikeMs: -1 };
  assert.equal(integrateNeuron(n, 10, 0.25, 0), 1);
  assert.equal(n.spikeCount, 1);
  assert.ok(n.v < -50 && n.v > -80);
  assert.ok(n.u > -6 && n.u < -4);
  assert.ok(n.lastSpikeMs > 0 && n.lastSpikeMs <= 0.25);
});

test('sustained current produces repeated spikes; zero drive remains quiescent', () => {
  const make = () => ({ v: -65, u: -13, a: 0.02, b: 0.2, c: -65, d: 8, spikeCount: 0, lastSpikeMs: -1 });
  const resting = make(), stimulated = make();
  for (let i = 0; i < 4000; i++) { integrateNeuron(resting, 0, 0.25, i * 0.25); integrateNeuron(stimulated, 10, 0.25, i * 0.25); }
  assert.equal(resting.spikeCount, 0);
  assert.ok(stimulated.spikeCount > 15 && stimulated.spikeCount < 40);
});

test('matched control receives exactly the same network and noise in the absence of pharmacology', () => {
  const network = new NeuralSimulation({ seed: 991 });
  network.advance(2000);
  assert.deepEqual(network.neurons, network.baselineNeurons);
  assert.deepEqual(network.spikes, network.baselineSpikes);
  assert.equal(network.stats.excitatoryDeltaHz, 0);
  assert.equal(network.stats.inhibitoryDeltaHz, 0);
  assert.ok(network.stats.meanExcitatoryHz > 0);
  assert.ok(network.stats.meanInhibitoryHz > 0);
});

test('network edges obey E/I signs and cells retain finite voltage and recovery', () => {
  const network = new NeuralSimulation();
  for (const edge of network.connections) {
    assert.notEqual(edge.from, edge.to);
    assert.ok(network.neurons[edge.from].type === 'E' ? edge.weight > 0 : edge.weight < 0);
  }
  network.setTargets({ NACHR: { delta: 0.95 }, GABAA: { delta: 0.25 }, NMDA: { delta: -0.5 } });
  network.advance(4000);
  for (const n of [...network.neurons, ...network.baselineNeurons]) {
    assert.ok(Number.isFinite(n.v) && Number.isFinite(n.u));
    assert.ok(n.v < 30 && n.v > -150);
    assert.ok(n.synE >= 0 && n.synI >= 0);
  }
  assert.ok(network.trace.length <= 1000);
  assert.ok(network.spikes.every(s => s.timeMs >= network.timeMs - 2000));
});

test('illustrative nicotinic excitation and GABA potentiation shift E firing in opposite directions', () => {
  const excited = new NeuralSimulation({ seed: 713 }), inhibited = new NeuralSimulation({ seed: 713 });
  excited.setTargets({ NACHR: { delta: 0.8 } });
  inhibited.setTargets({ GABAA: { delta: 0.5 } });
  excited.advance(3000); inhibited.advance(3000);
  assert.ok(excited.stats.meanExcitatoryHz > excited.stats.baselineExcitatoryHz + 2);
  assert.ok(inhibited.stats.meanExcitatoryHz < inhibited.stats.baselineExcitatoryHz - 2);
  assert.equal(excited.stats.baselineExcitatoryHz, inhibited.stats.baselineExcitatoryHz);
});

test('LSD profile changes activity reproducibly through the assumed HT2A pathway, not a validated psychedelic-effect prediction', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/compound-catalog.json', import.meta.url)));
  // Fix a virtual free-brain concentration so this tests PD→circuit coupling
  // independently of accelerated PK playback. It is not a dosing model.
  const targets = computeTargets([{ id: 'lsd', brainNM: 30 }], catalog);
  assert.ok(targets.HT2A.delta > 0);
  assert.equal(targets.HT2A.contributors[0].action, 'partial_agonist');
  const full = new NeuralSimulation({ seed: 817 });
  const repeat = new NeuralSimulation({ seed: 817 });
  const withoutHT2A = new NeuralSimulation({ seed: 817 });
  full.setTargets(targets); repeat.setTargets(targets);
  const ablatedTargets = structuredClone(targets);
  ablatedTargets.HT2A.delta = 0;
  ablatedTargets.HT2A.activity = ablatedTargets.HT2A.baselineActivity;
  withoutHT2A.setTargets(ablatedTargets);
  full.advance(3000); repeat.advance(3000); withoutHT2A.advance(3000);
  assert.deepEqual(full.snapshot(), repeat.snapshot());
  assert.ok(full.stats.meanExcitatoryHz > full.stats.baselineExcitatoryHz);
  assert.ok(full.stats.meanExcitatoryHz > withoutHT2A.stats.meanExcitatoryHz);
  assert.equal(full.stats.baselineExcitatoryHz, withoutHT2A.stats.baselineExcitatoryHz);
  assert.ok(full.neurons.every(n => Number.isFinite(n.v) && Number.isFinite(n.u)));
  assert.match(full.stats.interpretation, /Illustrative/);
});

test('smaller integration step preserves deterministic DC firing to within one spike', () => {
  const count = dtMs => {
    const n = new NeuralSimulation({ excitatoryCount: 1, inhibitoryCount: 0, connectionProbability: 0, noiseAmplitude: 0, excitatoryInput: 10, dtMs });
    n.advance(1000);
    return n.neurons[0].spikeCount;
  };
  const a = count(0.25), b = count(0.125), c = count(0.0625);
  assert.ok(Math.abs(a - c) <= 1 && Math.abs(b - c) <= 1);
});

test('fixed stepping produces identical state for different rendering partitions', () => {
  const a = new NeuralSimulation({ seed: 482 }), b = new NeuralSimulation({ seed: 482 });
  a.setTargets({ HT2A: { delta: 0.5 } }); b.setTargets({ HT2A: { delta: 0.5 } });
  a.advance(1000); for (let i = 0; i < 60; i++) b.advance(1000 / 60);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('JSON checkpoint preserves both populations, pending input, random noise and future spikes', () => {
  const network = new NeuralSimulation({ seed: 619 });
  network.setTargets({ SERT: { activity: 0.1 } });
  network.advance(231.37);
  const checkpoint = JSON.parse(JSON.stringify(network.snapshot()));
  const restored = new NeuralSimulation({ seed: 1 }).restore(checkpoint);
  network.advance(861.39); restored.advance(861.39);
  assert.deepEqual(network.snapshot(), restored.snapshot());
  restored.reset(619);
  assert.equal(restored.timeMs, 0);
  assert.equal(restored.stats.totalSpikes, 0);
});

test('no invented cofactor effect and invalid network/time parameters rejected', () => {
  assert.deepEqual(modulationFromTargets({}), modulationFromTargets({ B12: { delta: 999 } }));
  const network = new NeuralSimulation();
  for (const value of [-1, NaN, Infinity]) assert.throws(() => network.advance(value), RangeError);
  assert.throws(() => new NeuralSimulation({ dtMs: 1 }), RangeError);
  assert.throws(() => new NeuralSimulation({ dtMs: 0.3 }), RangeError);
  assert.throws(() => new NeuralSimulation({ excitatoryCount: 0, inhibitoryCount: 0 }), RangeError);
});
