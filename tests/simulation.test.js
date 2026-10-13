import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Simulation, DEFAULT_PARAMS, FIXED_DT, BOUNDS, MICROMOLAR_PER_PARTICLE,
  seededRandom, gaussian, probability, equilibriumOccupancy, competitiveVelocity,
  reflectedCoordinate, brownianDisplacement, batemanConcentration,
} from '../src/simulation.js';

test('Brownian samples have zero mean, variance 2Ddt per axis, and MSD 6Ddt', () => {
  const rng = seededRandom(712);
  const n = 100000, d = DEFAULT_PARAMS.diffusionCoefficient, dt = 2e-10;
  const sums = [0, 0, 0], squares = [0, 0, 0];
  let xy = 0;
  for (let i = 0; i < n; i++) {
    const p = brownianDisplacement(d, dt, rng);
    [p.x, p.y, p.z].forEach((v, j) => { sums[j] += v; squares[j] += v * v; });
    xy += p.x * p.y;
  }
  const variance = 2 * d * dt;
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(sums[axis] / n) < 0.006);
    assert.ok(Math.abs(squares[axis] / n / variance - 1) < 0.015);
  }
  assert.ok(Math.abs(xy / n) < 0.002);
  assert.ok(Math.abs(squares.reduce((a, b) => a + b) / n / (6 * d * dt) - 1) < 0.01);
});

test('reflection handles arbitrarily large crossings and reaches uniform confinement', () => {
  assert.equal(reflectedCoordinate(11, -10, 10), 9);
  assert.equal(reflectedCoordinate(-11, -10, 10), -9);
  assert.equal(reflectedCoordinate(51, -10, 10), 9);
  const rng = seededRandom(819);
  const bins = Array(10).fill(0);
  for (let i = 0; i < 100000; i++) {
    const value = reflectedCoordinate(100 * gaussian(rng), -10, 10);
    assert.ok(value >= -10 && value <= 10);
    bins[Math.min(9, Math.floor((value + 10) / 2))]++;
  }
  for (const count of bins) assert.ok(Math.abs(count / 10000 - 1) < 0.04);
});

test('fixed stepping is identical across different render-frame partitions', () => {
  const a = new Simulation({ seed: 9 });
  const b = new Simulation({ seed: 9 });
  a.advance(3);
  for (let i = 0; i < 180; i++) b.advance(1 / 60);
  assert.equal(a.time, 3);
  assert.equal(b.time, 3);
  assert.deepEqual(a.stats, b.stats);
  assert.deepEqual(a.particles, b.particles);
  assert.deepEqual(a.transporters, b.transporters);
  assert.deepEqual(a.receptors, b.receptors);
  assert.equal(a.advance(0), 0);
});

test('substep time accumulates without moving particles prematurely', () => {
  const sim = new Simulation({ seed: 11 });
  const before = structuredClone(sim.particles);
  assert.equal(sim.advance(FIXED_DT / 3), 0);
  assert.deepEqual(sim.particles, before);
  assert.equal(sim.advance(FIXED_DT * 2 / 3), 1);
  assert.equal(sim.time, FIXED_DT);
});

test('drug-only equilibrium follows L / (L + Kd)', () => {
  const sim = new Simulation({ seed: 72, initialSerotonin: 0, releaseRate: 0, drugConcentration: 1, transporterCount: 100 });
  sim.advance(60);
  let occupied = 0, samples = 0;
  for (let i = 0; i < 300; i++) {
    sim.advance(0.5);
    occupied += sim.stats.occupancy;
    samples++;
  }
  const expected = equilibriumOccupancy(1, DEFAULT_PARAMS.drugOffRate / DEFAULT_PARAMS.drugOnRate);
  assert.ok(Math.abs(occupied / samples - expected) < 0.045, `observed ${occupied / samples}, expected ${expected}`);
});

test('escitalopram reduces ensemble reuptake and increases available cleft serotonin', () => {
  let controlUptake = 0, drugUptake = 0, controlCleft = 0, drugCleft = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const common = { seed, initialSerotonin: 120, releaseRate: 0, clearanceRate: 0 };
    const control = new Simulation({ ...common, drugConcentration: 0 });
    const treated = new Simulation({ ...common, drugConcentration: 100 });
    control.advance(8);
    treated.advance(8);
    controlUptake += control.stats.reuptake;
    drugUptake += treated.stats.reuptake;
    controlCleft += control.stats.cleft;
    drugCleft += treated.stats.cleft;
  }
  assert.ok(drugUptake < controlUptake * 0.55, `control uptake ${controlUptake}, drug uptake ${drugUptake}`);
  assert.ok(drugCleft > controlCleft * 1.5);
});

test('binding, transport, clearance, recycling, and releases conserve every particle', () => {
  const sim = new Simulation({ seed: 219, drugConcentration: 8, releaseRate: 4, clearanceRate: 0.1 });
  for (let i = 0; i < 2000; i++) {
    sim.step();
    if (i % 300 === 0) sim.releaseBurst(25);
    const st = sim.stats;
    assert.ok(st.conserved);
    assert.equal(st.created, sim.particles.length);
    assert.equal(st.cleared, st.stateCounts.cleared);
    assert.equal(st.reuptake - st.recycled, st.cytosolic);
    assert.equal(st.released, st.cleft + st.boundSubstrate + st.boundReceptors + st.reuptake + st.cleared);
    const bound = new Set();
    for (const actor of sim.transporters) {
      if (actor.state === 'substrate') {
        assert.ok(!bound.has(actor.particleId));
        bound.add(actor.particleId);
        assert.equal(sim.particles[actor.particleId].state, 'sert');
      } else {
        assert.equal(actor.particleId, null, 'drug and substrate binding are mutually exclusive');
      }
    }
    for (const actor of sim.receptors) {
      if (actor.state === 'bound') {
        assert.ok(!bound.has(actor.particleId));
        bound.add(actor.particleId);
        assert.equal(sim.particles[actor.particleId].state, 'receptor');
      }
    }
    for (const p of sim.particles.filter((p) => p.state === 'cleft')) {
      for (const axis of ['x', 'y', 'z']) assert.ok(p[axis] >= BOUNDS[axis][0] && p[axis] <= BOUNDS[axis][1]);
    }
  }
  assert.ok(sim.stats.reuptake > 0);
  assert.ok(sim.stats.recycled > 0);
  assert.ok(sim.stats.cleared > 0);
  assert.ok(sim.counters.receptorBindings > 0);
  assert.ok(sim.counters.drugBindings > 0);
});

test('reset with original seed reconstructs the original state', () => {
  const sim = new Simulation({ seed: 127 });
  const start = structuredClone(sim.particles);
  sim.advance(2);
  sim.reset(127);
  assert.equal(sim.time, 0);
  assert.equal(sim.stats.reuptake, 0);
  assert.deepEqual(sim.particles, start);
});

test('JSON checkpoints restore both random streams and reproduce future events exactly', () => {
  const first = new Simulation({ seed: 514 });
  first.advance(2.345);
  const checkpoint = JSON.parse(JSON.stringify(first.snapshot()));
  const restored = new Simulation({ seed: 8 }).restore(checkpoint);
  first.advance(3.219);
  restored.advance(3.219);
  assert.deepEqual(restored.snapshot(), first.snapshot());
  restored.reset(8);
  assert.equal(checkpoint.time, 2.34, 'restoring must not retain mutable references to the checkpoint');
});

test('zero substrate never generates uptake and zero drug never generates drug occupancy', () => {
  const empty = new Simulation({ initialSerotonin: 0, releaseRate: 0 });
  empty.advance(10);
  assert.equal(empty.stats.reuptake, 0);
  assert.equal(empty.stats.boundReceptors, 0);
  const untreated = new Simulation({ drugConcentration: 0 });
  untreated.advance(10);
  assert.equal(untreated.stats.boundDrug, 0);
  assert.equal(untreated.counters.drugBindings, 0);
});

test('changing the drug reservoir preserves bound drug and washout follows dissociation kinetics', () => {
  const sim = new Simulation({ seed: 885, initialSerotonin: 0, releaseRate: 0, drugConcentration: 100, transporterCount: 1000 });
  sim.advance(2);
  const before = structuredClone(sim.transporters);
  const counters = { ...sim.counters };
  const boundAtWashout = sim.stats.boundDrug;
  assert.ok(boundAtWashout > 950);
  sim.setParams({ drugConcentration: 0 });
  assert.deepEqual(sim.transporters, before, 'reservoir changes must not instantly remove bound drug');
  assert.deepEqual(sim.counters, counters, 'reservoir changes must preserve recorded event counts');
  let previous = boundAtWashout;
  for (let i = 0; i < 20; i++) {
    sim.advance(1);
    assert.ok(sim.stats.boundDrug <= previous, 'there is no new association after complete washout');
    previous = sim.stats.boundDrug;
  }
  assert.equal(sim.counters.drugBindings, counters.drugBindings);
  const expected = boundAtWashout * Math.exp(-sim.params.drugOffRate * 20);
  assert.ok(Math.abs(sim.stats.boundDrug - expected) < 45, `observed ${sim.stats.boundDrug}, expected ${expected}`);
});

test('analytic hazard, competitive kinetics, and concentration unit conversions', () => {
  assert.equal(probability(0, 1), 0);
  assert.ok(Math.abs(probability(2, 0.5) - (1 - Math.exp(-1))) < 1e-15);
  assert.ok(probability(1e-10, 1e-10) > 0);
  assert.equal(equilibriumOccupancy(10, 10), 0.5);
  assert.equal(competitiveVelocity(5, 0, 10, 5, 1), 5);
  assert.equal(competitiveVelocity(5, 2, 10, 5, 1), 2.5);
  assert.ok(MICROMOLAR_PER_PARTICLE > 3.19 && MICROMOLAR_PER_PARTICLE < 3.20);
});

test('Bateman curve handles equal rates, onset, peak, and 30-hour terminal half-life', () => {
  assert.equal(batemanConcentration(0), 0);
  assert.ok(batemanConcentration(3) > batemanConcentration(0.1));
  assert.ok(Math.abs(batemanConcentration(90) / batemanConcentration(60) - 0.5) < 1e-10);
  assert.ok(Math.abs(batemanConcentration(2, { ka: 1, ke: 1 }) - 2 * Math.exp(-2)) < 1e-15);
  assert.ok(batemanConcentration(3, { ka: 0.01, ke: 1 }) > 0);
  assert.equal(batemanConcentration(1e6), 0);
});

test('invalid parameters and time increments fail instead of silently corrupting the simulation', () => {
  const sim = new Simulation();
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => sim.advance(value), RangeError);
    assert.throws(() => sim.setParams({ diffusionCoefficient: value }), RangeError);
  }
  assert.throws(() => sim.setParams({ mystery: 1 }), TypeError);
  assert.throws(() => sim.setParams({ transporterCount: 2 }), TypeError);
  assert.throws(() => new Simulation({ initialSerotonin: 0.2 }), RangeError);
  assert.throws(() => sim.releaseBurst(1.5), RangeError);
  assert.throws(() => reflectedCoordinate(1, 2, 2), RangeError);
});

test('particle cap is respected while recycled particles remain releasable', () => {
  const sim = new Simulation({ initialSerotonin: 10, maxParticles: 10, drugConcentration: 0, releaseRate: 0, clearanceRate: 0 });
  assert.equal(sim.releaseBurst(100), 0);
  sim.advance(30);
  const pool = sim.stats.vesicular;
  assert.ok(pool > 0);
  assert.equal(sim.releaseBurst(100), pool);
  assert.equal(sim.particles.length, 10);
});
