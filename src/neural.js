/**
 * A small cortical E/I network using Izhikevich's 2003 phenomenological model.
 * v'=.04v²+5v+140-u+I; u'=a(bv-u); at v>=30mV: v=c,u+=d.
 * Source: https://www.izhikevich.org/publications/spikes.pdf
 * Neural time (ms) is separate from PK time (hours). Receptor-to-current
 * coefficients below are exposed illustrative choices, not measured regional
 * pharmacodynamics. This network does not predict subjective drug effects.
 */
import { seededRandom, gaussian } from './simulation.js';

export const NEURAL_DT_MS = 0.25;
export const NEURAL_DEFAULTS = Object.freeze({ seed: 42, excitatoryCount: 32, inhibitoryCount: 8, dtMs: NEURAL_DT_MS, connectionProbability: 0.2, excitatoryInput: 6, inhibitoryInput: 5, noiseAmplitude: 0.9 });
const clone = value => structuredClone(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
function nonnegative(value, name) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`); return value; }

/** Every coefficient here is a model assumption. Sign and magnitude depend
 * on cell type, brain region and circuit in reality. Transporter blockade is
 * mapped to a bounded monoamine drive; there is no simulated transmitter pool.
 */
export function modulationFromTargets(targets = {}) {
  const delta = id => Number.isFinite(targets[id]?.delta) ? targets[id].delta : 0;
  const blockade = id => Number.isFinite(targets[id]?.activity) ? clamp(1 - targets[id].activity, 0, 1) : 0;
  const gaba = Math.max(0, delta('GABAA'));
  const nmda = Math.max(0, -delta('NMDA'));
  const monoamine = 0.4 * blockade('SERT') + 1.2 * blockade('DAT') + 1.2 * blockade('NET');
  return {
    excitatoryBias: clamp(monoamine + 4 * delta('HT2A') - 3 * delta('HT1A') - 1.2 * delta('D2') + 4 * delta('NACHR') - 4 * delta('ADENOSINE') - 3 * gaba, -5, 7),
    inhibitoryBias: clamp(1.5 * delta('NACHR') - nmda, -3, 3),
    excitatoryGain: clamp(1 - 1.2 * nmda, 0.2, 2),
    inhibitoryGain: clamp(1 + 4 * gaba, 0.25, 4),
    interpretation: 'Illustrative cortical E/I transfer function; not a universal receptor effect or clinical prediction.',
  };
}

/** A single bounded substep with threshold/reset handling. Returns spike count.
 * Voltage uses two half Euler steps, as in the original simple model's code;
 * recovery follows a full Euler update. Threshold is checked after each half.
 */
export function integrateNeuron(neuron, current, dtMs, timeMs = 0) {
  if (!Number.isFinite(current)) throw new RangeError('Current must be finite');
  nonnegative(dtMs, 'dtMs');
  let spikes = 0;
  for (let half = 0; half < 2; half++) {
    neuron.v += dtMs / 2 * (0.04 * neuron.v * neuron.v + 5 * neuron.v + 140 - neuron.u + current);
    if (neuron.v >= 30) {
      neuron.v = neuron.c; neuron.u += neuron.d;
      neuron.spikeCount = (neuron.spikeCount || 0) + 1;
      neuron.lastSpikeMs = timeMs + dtMs * (half + 1) / 2;
      spikes++;
    }
  }
  neuron.u += dtMs * neuron.a * (neuron.b * neuron.v - neuron.u);
  return spikes;
}

export class NeuralSimulation {
  constructor(options = {}) {
    this.options = { ...NEURAL_DEFAULTS, ...options };
    for (const field of ['excitatoryCount', 'inhibitoryCount']) {
      if (!Number.isInteger(this.options[field]) || this.options[field] < 0) throw new RangeError(`${field} must be a nonnegative integer`);
    }
    const count = this.options.excitatoryCount + this.options.inhibitoryCount;
    if (count < 1 || count > 1000) throw new RangeError('Network size must be between 1 and 1000');
    if (!Number.isFinite(this.options.dtMs) || this.options.dtMs <= 0 || this.options.dtMs > 0.5) throw new RangeError('dtMs must be in (0,0.5]');
    if (Math.abs(1 / this.options.dtMs - Math.round(1 / this.options.dtMs)) > 1e-8) throw new RangeError('dtMs must divide 1ms exactly');
    nonnegative(this.options.noiseAmplitude, 'noiseAmplitude');
    if (!Number.isFinite(this.options.connectionProbability) || this.options.connectionProbability < 0 || this.options.connectionProbability > 1) throw new RangeError('connectionProbability must be in [0,1]');
    for (const field of ['excitatoryInput', 'inhibitoryInput']) if (!Number.isFinite(this.options[field])) throw new RangeError(`${field} must be finite`);
    this.reset();
  }

  reset(seed = this.options.seed) {
    nonnegative(seed, 'seed'); this.options.seed = seed;
    const architectureRng = seededRandom(seed);
    this.noiseRng = seededRandom((seed >>> 0) ^ 0x742cef21);
    this.ticks = 0; this.timeMs = 0; this.accumulator = 0; this.lastNoiseTick = -1;
    const count = this.options.excitatoryCount + this.options.inhibitoryCount;
    this.neurons = Array.from({ length: count }, (_, id) => {
      const type = id < this.options.excitatoryCount ? 'E' : 'I';
      const theta = id * 2.399963229728653;
      const y = 1 - 2 * (id + 0.5) / count;
      const radius = Math.sqrt(1 - y * y);
      const variation = architectureRng();
      const a = type === 'E' ? 0.02 : 0.1;
      const b = 0.2;
      const c = type === 'E' ? -65 + 5 * variation * variation : -65;
      const d = type === 'E' ? 8 - 2 * variation * variation : 2;
      return { id, type, a, b, c, d, v: -65, u: b * -65, synE: 0, synI: 0, spikeCount: 0, lastSpikeMs: -1e9, x: 110 * radius * Math.cos(theta), y: 80 * y, z: 90 * radius * Math.sin(theta) };
    });
    this.baselineNeurons = clone(this.neurons);
    this.connections = [];
    this.outgoing = Array.from({ length: count }, () => []);
    for (let from = 0; from < count; from++) for (let to = 0; to < count; to++) {
      if (from === to || architectureRng() >= this.options.connectionProbability) continue;
      const weight = this.neurons[from].type === 'E' ? 0.25 + 0.25 * architectureRng() : -(0.9 + 0.6 * architectureRng());
      const edge = { from, to, weight };
      this.connections.push(edge); this.outgoing[from].push(edge);
    }
    this.noise = Array(count).fill(0);
    this.targets = {};
    this.modulation = modulationFromTargets();
    this.spikes = []; this.baselineSpikes = []; this.trace = [];
    return this;
  }

  setTargets(targets = {}) {
    this.targets = clone(targets);
    this.modulation = modulationFromTargets(targets);
    return this.modulation;
  }

  advance(ms) {
    nonnegative(ms, 'ms');
    this.accumulator += ms;
    const count = Math.floor((this.accumulator + 1e-9) / this.options.dtMs);
    for (let i = 0; i < count; i++) this.step();
    this.accumulator -= count * this.options.dtMs;
    if (Math.abs(this.accumulator) < 1e-9) this.accumulator = 0;
    return count;
  }

  _advancePopulation(population, baseline, time, dt) {
    const fired = [];
    const modulation = baseline ? { excitatoryBias: 0, inhibitoryBias: 0, excitatoryGain: 1, inhibitoryGain: 1 } : this.modulation;
    for (const neuron of population) {
      neuron.synE *= Math.exp(-dt / 5); neuron.synI *= Math.exp(-dt / 10);
      const bias = neuron.type === 'E' ? this.options.excitatoryInput + modulation.excitatoryBias : this.options.inhibitoryInput + modulation.inhibitoryBias;
      const current = bias + neuron.synE * modulation.excitatoryGain - neuron.synI * modulation.inhibitoryGain + this.noise[neuron.id];
      const count = integrateNeuron(neuron, current, dt, time);
      if (count) {
        fired.push(neuron.id);
        (baseline ? this.baselineSpikes : this.spikes).push({ neuronId: neuron.id, type: neuron.type, timeMs: neuron.lastSpikeMs });
      }
    }
    // Deliver after integrating all neurons: no dependence on neuron order.
    for (const id of fired) for (const edge of this.outgoing[id]) {
      if (edge.weight > 0) population[edge.to].synE += edge.weight;
      else population[edge.to].synI -= edge.weight;
    }
  }

  step() {
    const dt = this.options.dtMs;
    // Piecewise constant, seeded background current refreshed every 1ms;
    // both populations receive exactly the same realization.
    const noiseTick = Math.floor(this.timeMs + 1e-9);
    if (noiseTick !== this.lastNoiseTick) {
      for (let i = 0; i < this.noise.length; i++) this.noise[i] = gaussian(this.noiseRng) * this.options.noiseAmplitude;
      this.lastNoiseTick = noiseTick;
    }
    this._advancePopulation(this.neurons, false, this.timeMs, dt);
    this._advancePopulation(this.baselineNeurons, true, this.timeMs, dt);
    this.timeMs = ++this.ticks * dt;
    if (this.ticks % Math.round(2 / dt) === 0) this.trace.push({ timeMs: this.timeMs, voltage: this.neurons[0].v, baselineVoltage: this.baselineNeurons[0].v });
    while (this.spikes.length && this.spikes[0].timeMs < this.timeMs - 2000) this.spikes.shift();
    while (this.baselineSpikes.length && this.baselineSpikes[0].timeMs < this.timeMs - 2000) this.baselineSpikes.shift();
    if (this.trace.length > 1000) this.trace.shift();
  }

  get stats() {
    const windowMs = Math.min(this.timeMs, 1000);
    const rate = (spikes, type, count) => windowMs && count ? spikes.filter(s => s.type === type && s.timeMs > this.timeMs - windowMs).length / count * 1000 / windowMs : 0;
    const e = this.options.excitatoryCount, i = this.options.inhibitoryCount;
    const totalSpikes = this.neurons.reduce((sum, n) => sum + n.spikeCount, 0);
    const meanExcitatoryHz = rate(this.spikes, 'E', e), meanInhibitoryHz = rate(this.spikes, 'I', i);
    const baselineExcitatoryHz = rate(this.baselineSpikes, 'E', e), baselineInhibitoryHz = rate(this.baselineSpikes, 'I', i);
    return { timeMs: this.timeMs, meanExcitatoryHz, meanInhibitoryHz, baselineExcitatoryHz, baselineInhibitoryHz, excitatoryDeltaHz: meanExcitatoryHz - baselineExcitatoryHz, inhibitoryDeltaHz: meanInhibitoryHz - baselineInhibitoryHz, totalSpikes, baselineTotalSpikes: this.baselineNeurons.reduce((sum, n) => sum + n.spikeCount, 0), excitatoryCount: e, inhibitoryCount: i, windowMs, modulation: { ...this.modulation }, interpretation: 'Illustrative small cortical E/I circuit; neural milliseconds and PK hours are separate clocks.' };
  }

  snapshot() {
    return clone({ version: 1, options: this.options, ticks: this.ticks, timeMs: this.timeMs, accumulator: this.accumulator, neurons: this.neurons, baselineNeurons: this.baselineNeurons, connections: this.connections, noise: this.noise, lastNoiseTick: this.lastNoiseTick, noiseRandomState: this.noiseRng.getState(), targets: this.targets, modulation: this.modulation, spikes: this.spikes, baselineSpikes: this.baselineSpikes, trace: this.trace });
  }

  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1) throw new TypeError('Unsupported neural checkpoint');
    const data = clone(snapshot);
    const checked = new NeuralSimulation(data.options);
    if (!Number.isInteger(data.ticks) || data.ticks < 0 || data.timeMs !== data.ticks * checked.options.dtMs) throw new RangeError('Invalid checkpoint time');
    nonnegative(data.accumulator, 'accumulator');
    if (data.accumulator >= checked.options.dtMs) throw new RangeError('Invalid checkpoint remainder');
    if (data.neurons.length !== checked.neurons.length || data.baselineNeurons.length !== checked.neurons.length) throw new TypeError('Checkpoint neuron count mismatch');
    checked.noiseRng.setState(data.noiseRandomState);
    for (const key of ['options', 'ticks', 'timeMs', 'accumulator', 'neurons', 'baselineNeurons', 'connections', 'noise', 'lastNoiseTick', 'targets', 'modulation', 'spikes', 'baselineSpikes', 'trace']) this[key] = data[key];
    this.noiseRng = checked.noiseRng;
    this.outgoing = Array.from({ length: this.neurons.length }, () => []);
    for (const edge of this.connections) this.outgoing[edge.from].push(edge);
    return this;
  }
}
