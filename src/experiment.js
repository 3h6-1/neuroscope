import { PharmacologySimulation, validateCompound, PK_DT_HOURS } from './pharmacology.js';
import { NeuralSimulation, NEURAL_DT_MS } from './neural.js';
import { Simulation, BOUNDS } from './simulation.js';
import { BrainSimulation, BRAIN_DT_MS } from './brain.js';
import { CognitiveWorkspace } from './cognition.js';

export const EXPERIMENT_DT_SECONDS = 0.05;
export const EXPERIMENT_CLOCKS = Object.freeze({ pkHoursPerPlaybackSecond: 0.5, neuralMsPerPlaybackSecond: 25, synapseSecondsPerPlaybackSecond: 1 });
const HISTORY_SECONDS = 120;
const CHECKPOINT_SECONDS = 1;
const EPSILON = 1e-8;
const clone = value => structuredClone(value);
const finite = (value, name, min = 0, max = Infinity) => {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`Invalid ${name}`);
  return value;
};
const integer = (value, name, min = 0, max = Infinity) => {
  finite(value, name, min, max);
  if (!Number.isInteger(value)) throw new RangeError(`Invalid ${name}`);
  return value;
};
const array = (value, name, max) => {
  if (!Array.isArray(value) || value.length > max) throw new TypeError(`Invalid ${name}`);
  return value;
};

function validateEngineStates(state) {
  if (!state || state.version !== 1) throw new TypeError('Unsupported experiment checkpoint');
  integer(state.ticks, 'playback tick count'); finite(state.timeSeconds, 'playback time');
  finite(state.accumulator, 'playback remainder', 0, EXPERIMENT_DT_SECONDS);
  if (state.accumulator >= EXPERIMENT_DT_SECONDS || Math.abs(state.timeSeconds - state.ticks * EXPERIMENT_DT_SECONDS) > EPSILON) throw new RangeError('Invalid playback clock');
  if (typeof state.advanceSystemic !== 'boolean') throw new TypeError('Invalid systemic-clock switch');
  if (!state.pk || !state.neural || !state.synapse) throw new TypeError('Checkpoint is missing an engine');
  const profiles = array(state.pk.compounds, 'compound profiles', 1200);
  const ids = new Set();
  for (const profile of profiles) {
    validateCompound(profile);
    if (ids.has(profile.id)) throw new TypeError('Duplicate compound profile');
    ids.add(profile.id);
  }
  if (state.pk.options?.stepHours !== PK_DT_HOURS || state.neural.options?.dtMs !== NEURAL_DT_MS) throw new RangeError('Checkpoint uses incompatible engine clocks');
  finite(state.pk.timeHours, 'PK time'); finite(state.neural.timeMs, 'neural time'); finite(state.synapse.time, 'synapse time');
  if (state.pk.timeHours > state.timeSeconds * EXPERIMENT_CLOCKS.pkHoursPerPlaybackSecond + EPSILON || Math.abs(state.neural.timeMs - state.timeSeconds * EXPERIMENT_CLOCKS.neuralMsPerPlaybackSecond) > EPSILON || Math.abs(state.synapse.time - state.timeSeconds) > EPSILON) throw new RangeError('Engine clocks do not match playback');
  // Older v1 files predate the regional model/workspace. Their missing states
  // are initialized on import with an explicit migration note, never inferred.
  if (state.brain !== undefined) {
    if (!state.brain || state.brain.options?.dtMs !== BRAIN_DT_MS) throw new RangeError('Incompatible regional brain clock');
    finite(state.brain.timeMs, 'regional brain time'); finite(state.brain.accumulator, 'regional brain remainder', 0, BRAIN_DT_MS);
    if (Math.abs(state.brain.timeMs + state.brain.accumulator - state.neural.timeMs) > EPSILON) throw new RangeError('Regional brain clock does not match neural time');
  }
  if (state.cognition !== undefined) {
    if (!state.cognition || Math.abs(state.cognition.timeSeconds - state.timeSeconds) > EPSILON || state.cognition.accumulator !== 0) throw new RangeError('Cognitive workspace clock does not match playback');
  }

  if (!state.pk.records || typeof state.pk.records !== 'object' || Array.isArray(state.pk.records) || Object.keys(state.pk.records).length > 1200) throw new TypeError('Invalid PK records');
  for (const [id, record] of Object.entries(state.pk.records)) {
    if (id !== record.id || !ids.has(id)) throw new TypeError('PK record refers to unknown compound');
    if (typeof record.active !== 'boolean') throw new TypeError('Invalid exposure state');
    for (const field of ['plasmaAmountNMol', 'brainAmountNMol', 'initialAmountNMol', 'eliminatedNMol', 'removedNMol']) finite(record[field], `PK ${field}`);
    finite(record.clearanceFactor, 'clearance factor', 0, 1);
    const remaining = record.plasmaAmountNMol + record.brainAmountNMol;
    if (Math.abs(record.initialAmountNMol - remaining - record.eliminatedNMol - record.removedNMol) > 1e-7 * Math.max(1, record.initialAmountNMol)) throw new RangeError('PK mass balance is invalid');
    if (!record.active && remaining > EPSILON) throw new RangeError('Inactive exposure contains unaccounted mass');
  }
  for (const entry of array(state.pk.ledger, 'exposure ledger', 100000)) {
    if (!ids.has(entry.id) || !['exposure', 'remove'].includes(entry.type)) throw new TypeError('Invalid ledger entry');
    finite(entry.timeHours, 'ledger time', 0, state.pk.timeHours + EPSILON);
    finite(entry.amountNMol, 'ledger amount');
    if (entry.type === 'exposure') finite(entry.concentrationNM, 'ledger concentration', Number.MIN_VALUE);
  }

  const neuronalCount = integer(state.neural.options.excitatoryCount, 'E count', 0, 1000) + integer(state.neural.options.inhibitoryCount, 'I count', 0, 1000);
  if (neuronalCount < 1 || neuronalCount > 1000) throw new RangeError('Invalid neuronal population size');
  for (const key of ['neurons', 'baselineNeurons']) {
    if (array(state.neural[key], key, 1000).length !== neuronalCount) throw new TypeError('Neuronal array length does not match its parameters');
    for (const [id, n] of state.neural[key].entries()) {
      if (n.id !== id || n.type !== (id < state.neural.options.excitatoryCount ? 'E' : 'I')) throw new TypeError('Invalid neuron identity or type');
      for (const field of ['v', 'u', 'a', 'b', 'c', 'd', 'x', 'y', 'z']) finite(n[field], `neuron ${field}`, -1e6, 1e6);
      finite(n.synE, 'excitatory synaptic current'); finite(n.synI, 'inhibitory synaptic current'); integer(n.spikeCount, 'spike count');
      finite(n.lastSpikeMs, 'spike time', -1e9, state.neural.timeMs + EPSILON);
    }
  }
  for (const edge of array(state.neural.connections, 'connections', neuronalCount * neuronalCount)) {
    integer(edge.from, 'connection source', 0, neuronalCount - 1); integer(edge.to, 'connection destination', 0, neuronalCount - 1); finite(edge.weight, 'connection weight', -100, 100);
    if (edge.from === edge.to || (state.neural.neurons[edge.from].type === 'E' ? edge.weight <= 0 : edge.weight >= 0)) throw new TypeError('Invalid E/I connection');
  }
  if (array(state.neural.noise, 'background noise', 1000).length !== neuronalCount) throw new TypeError('Noise population mismatch');
  state.neural.noise.forEach(n => finite(n, 'background current', -1e6, 1e6));
  for (const key of ['spikes', 'baselineSpikes']) for (const spike of array(state.neural[key], key, 100000)) {
    integer(spike.neuronId, 'spiking neuron', 0, neuronalCount - 1); finite(spike.timeMs, 'spike timestamp', 0, state.neural.timeMs + EPSILON);
    if (spike.type !== state.neural.neurons[spike.neuronId].type) throw new TypeError('Spike cell type mismatch');
  }
  for (const entry of array(state.neural.trace, 'voltage trace', 1000)) {
    finite(entry.timeMs, 'trace time', 0, state.neural.timeMs + EPSILON); finite(entry.voltage, 'voltage', -1e6, 1e6); finite(entry.baselineVoltage, 'baseline voltage', -1e6, 1e6);
  }
  for (const field of ['excitatoryBias', 'inhibitoryBias', 'excitatoryGain', 'inhibitoryGain']) finite(state.neural.modulation?.[field], `modulation ${field}`, -100, 100);
  if (state.neural.modulation.inhibitionDecayMs !== undefined) finite(state.neural.modulation.inhibitionDecayMs, 'inhibitory decay', 0.01, 10000);

  const syn = state.synapse;
  integer(syn.params.maxParticles, 'particle cap', 0, 4000);
  const particles = array(syn.particles, 'serotonin particles', syn.params.maxParticles);
  const states = new Set(['cleft', 'sert', 'receptor', 'reuptaken', 'cleared', 'vesicle']);
  for (const [id, p] of particles.entries()) {
    if (p.id !== id || !states.has(p.state)) throw new TypeError('Invalid serotonin particle');
    for (const axis of ['x', 'y', 'z']) {
      finite(p[axis], `particle ${axis}`, -1e6, 1e6);
      if (p.state === 'cleft' && (p[axis] < BOUNDS[axis][0] || p[axis] > BOUNDS[axis][1])) throw new RangeError('Cleft particle lies outside the domain');
    }
    finite(p.age, 'particle age'); finite(p.stateSince, 'particle state time', 0, syn.time + EPSILON);
  }
  const owners = new Set();
  for (const [key, countName] of [['transporters', 'transporterCount'], ['receptors', 'receptorCount']]) {
    const count = integer(syn.params[countName], countName, 0, 1000);
    if (array(syn[key], key, 1000).length !== count) throw new TypeError('Synaptic actor array length mismatch');
    for (const [id, actor] of syn[key].entries()) {
      const allowed = key === 'transporters' ? ['free', 'drug', 'substrate'] : ['free', 'bound'];
      if (actor.id !== id || !allowed.includes(actor.state)) throw new TypeError('Invalid synaptic actor');
      for (const axis of ['x', 'y', 'z']) finite(actor[axis], `actor ${axis}`, -1e6, 1e6);
      finite(actor.stateSince, 'actor state time', 0, syn.time + EPSILON); finite(actor.phase, 'actor phase', 0, 1);
      if (['substrate', 'bound'].includes(actor.state)) {
        integer(actor.particleId, 'bound particle', 0, particles.length - 1);
        if (owners.has(actor.particleId) || particles[actor.particleId].state !== (key === 'transporters' ? 'sert' : 'receptor')) throw new TypeError('Bound molecule ownership is inconsistent');
        owners.add(actor.particleId);
      } else if (actor.particleId !== null) throw new TypeError('Unoccupied actor contains a particle');
    }
  }
  if (particles.filter(p => ['sert', 'receptor'].includes(p.state)).some(p => !owners.has(p.id))) throw new TypeError('Bound particle has no receptor/transporter');
  for (const key of ['created', 'released', 'reuptake', 'cleared', 'recycled', 'drugBindings', 'receptorBindings']) integer(syn.counters?.[key], `synapse ${key}`);
  if (syn.counters.created !== particles.length || syn.counters.cleared !== particles.filter(p => p.state === 'cleared').length) throw new RangeError('Synapse counts do not match particles');
  for (const event of array(syn.events, 'synapse events', 256)) finite(event.time, 'event timestamp', 0, syn.time + EPSILON);

  const qualitativeIds = new Set();
  for (const entry of array(state.qualitative, 'qualitative exposures', 1200)) {
    if (!ids.has(entry.id) || !profiles.find(p => p.id === entry.id).qualitativeExposureSupported || qualitativeIds.has(entry.id) || entry.qualitative !== true) throw new TypeError('Unsupported qualitative exposure');
    qualitativeIds.add(entry.id);
    finite(entry.initialPlasmaNM, 'qualitative concentration', Number.MIN_VALUE);
    finite(entry.addedAtHours, 'qualitative exposure time', 0, state.pk.timeHours + EPSILON);
  }
}

/** Coordinates separate model clocks. Playback seconds are NOT elapsed
 * human physiology: PK hours, neural milliseconds and local synapse seconds
 * are deliberately independent scales, exposed in EXPERIMENT_CLOCKS.
 */
export class Experiment {
  constructor(catalog) {
    this.pk = new PharmacologySimulation(catalog);
    this.neural = new NeuralSimulation();
    this.synapse = new Simulation({ drugConcentration: 0, releaseRate: 3 });
    this.brain = new BrainSimulation();
    this.cognition = new CognitiveWorkspace();
    this._advanceSystemic = true;
    this.timeSeconds = 0; this.ticks = 0; this.accumulator = 0;
    this.qualitative = [];
    this.checkpoints = []; this.history = []; this.latestTime = 0; this.atHistory = false;
    this._checkpoint();
  }

  get profiles() { return this.pk.compounds; }
  get advanceSystemic() { return this._advanceSystemic; }
  set advanceSystemic(value) {
    if (typeof value !== 'boolean') throw new TypeError('advanceSystemic must be boolean');
    if (value === this._advanceSystemic) return;
    this._branch(); this._advanceSystemic = value; this._checkpoint();
  }
  get earliestTime() { return this.checkpoints[0]?.timeSeconds ?? this.timeSeconds; }
  setAdvanceSystemic(value) { this.advanceSystemic = value; return this; }

  _syncTargets() {
    const targets = this.pk.stats.targets;
    this.neural.setTargets(targets);
    this.brain.setTargets(targets);
    // Match the target layer's remaining uptake capacity, including functional
    // uptake assays. The microdomain still uses illustrative kinetics/Kd=1 nM:
    // capacity=1/(1+load). This is an equivalent reservoir, not drug concentration.
    const capacity = Math.max(1e-9, targets.SERT.activity);
    const load = (1 - capacity) / capacity;
    this.synapse.setParams({ drugConcentration: load });
  }

  _step(record = true) {
    const dt = EXPERIMENT_DT_SECONDS;
    if (this._advanceSystemic) this.pk.advance(dt * EXPERIMENT_CLOCKS.pkHoursPerPlaybackSecond);
    this._syncTargets();
    this.neural.advance(dt * EXPERIMENT_CLOCKS.neuralMsPerPlaybackSecond);
    this.brain.setDrive(this.cognition.drives);
    this.brain.advance(dt * EXPERIMENT_CLOCKS.neuralMsPerPlaybackSecond);
    this.cognition.advance(dt, this.brain.stats);
    this.synapse.advance(dt);
    this.timeSeconds = ++this.ticks * dt;
    if (record) {
      this.latestTime = this.timeSeconds;
      if (this.ticks % Math.round(CHECKPOINT_SECONDS / dt) === 0) this._checkpoint();
      this._pruneHistory();
    }
  }

  advance(seconds) {
    finite(seconds, 'playback duration');
    if (seconds === 0) return 0;
    this._branch();
    this.accumulator += seconds;
    const count = Math.floor((this.accumulator + 1e-10) / EXPERIMENT_DT_SECONDS);
    this.accumulator -= count * EXPERIMENT_DT_SECONDS;
    if (Math.abs(this.accumulator) < 1e-10) this.accumulator = 0;
    for (let i = 0; i < count; i++) this._step();
    return count;
  }

  _checkpoint() {
    const state = this.snapshot();
    // Replay checkpoints represent exact model ticks. Fractional playback
    // remainder belongs to the current renderer request, not historical time.
    state.accumulator = 0;
    const point = { timeSeconds: this.timeSeconds, state };
    const concentrations = Object.fromEntries(this.pk.stats.exposures.map(e => [e.id, { plasmaNM: e.plasmaNM, brainNM: e.brainNM }]));
    const sample = { timeSeconds: this.timeSeconds, pkHours: this.pk.timeHours, concentrations };
    if (this.checkpoints.at(-1)?.timeSeconds === this.timeSeconds) { this.checkpoints[this.checkpoints.length - 1] = point; this.history[this.history.length - 1] = sample; }
    else { this.checkpoints.push(point); this.history.push(sample); }
    // Retain one preceding checkpoint so the complete 120-second interval can
    // still be reconstructed at 50ms resolution.
    this._pruneHistory();
  }

  _pruneHistory() {
    while (this.checkpoints.length > 1 && this.checkpoints[1].timeSeconds <= this.timeSeconds - HISTORY_SECONDS + EPSILON) { this.checkpoints.shift(); this.history.shift(); }
  }

  _branch() {
    if (!this.atHistory) return;
    this.checkpoints = this.checkpoints.filter(c => c.timeSeconds <= this.timeSeconds + EPSILON);
    this.history = this.history.filter(h => h.timeSeconds <= this.timeSeconds + EPSILON);
    this.latestTime = this.timeSeconds; this.atHistory = false;
    this._checkpoint();
  }

  addExposure(id, initialPlasmaNM = 100) {
    finite(initialPlasmaNM, 'initial plasma concentration', 0.001, 1e6);
    const profile = this.pk.compounds.get(id);
    if (profile?.qualitativeExposureSupported) {
      this._branch();
      const existing = this.qualitative.find(e => e.id === id);
      if (existing) existing.initialPlasmaNM += initialPlasmaNM;
      else this.qualitative.push({ id, name: profile.name, initialPlasmaNM, addedAtHours: this.pk.timeHours, qualitative: true });
      this._checkpoint();
      return { supported: true, qualitative: true, id, exposure: clone(this.qualitative.find(e => e.id === id)), reason: profile.qualitativeExposureNote || 'Recorded qualitatively: brain concentrations and acute effects are unknown, not predicted.' };
    }
    const result = this.pk.addExposure(id, initialPlasmaNM);
    if (result.supported) { this._branch(); this._syncTargets(); this._checkpoint(); }
    return result;
  }

  removeExposure(id) {
    const qualitativeIndex = this.qualitative.findIndex(e => e.id === id);
    const removed = this.pk.removeExposure(id);
    if (qualitativeIndex < 0 && !removed) return false;
    this._branch();
    if (qualitativeIndex >= 0) this.qualitative.splice(qualitativeIndex, 1);
    this._syncTargets(); this._checkpoint();
    return true;
  }

  clearExposures() {
    this._branch();
    for (const exposure of this.pk.stats.exposures) this.pk.removeExposure(exposure.id);
    this.qualitative = [];
    this._syncTargets(); this._checkpoint();
    return this;
  }

  registerCompound(profile) {
    validateCompound(profile);
    if (!this.pk.compounds.has(profile.id) && this.pk.compounds.size >= 1200) throw new RangeError('Compound profile limit reached');
    const result = this.pk.registerCompound(profile);
    this._branch(); this._checkpoint();
    return result;
  }

  receiveMessage(text) {
    const message = this.cognition.receive(text);
    this._branch(); this._checkpoint();
    return message;
  }

  recordResponse(response) {
    const message = this.cognition.recordResponse(response);
    this._branch(); this._checkpoint();
    return message;
  }

  setAutonomous(value) {
    if (typeof value !== 'boolean') throw new TypeError('Autonomous workspace switch must be boolean');
    if (this.cognition.autonomous === value) return this;
    this._branch(); this.cognition.autonomous = value; this._checkpoint();
    return this;
  }

  reset() {
    this.pk.reset(); this.neural.reset(42); this.synapse.setParams({ drugConcentration: 0, releaseRate: 3 }); this.synapse.reset(42);
    this.brain.reset(42); this.cognition.reset();
    this.qualitative = []; this._advanceSystemic = true;
    this.timeSeconds = 0; this.ticks = 0; this.accumulator = 0;
    this.checkpoints = []; this.history = []; this.latestTime = 0; this.atHistory = false;
    this._checkpoint();
    return this;
  }

  seek(seconds) {
    finite(seconds, 'seek time', this.earliestTime, this.latestTime + EPSILON);
    // Save the live tail even when pausing between regular checkpoints.
    if (!this.atHistory) this._checkpoint();
    const targetTicks = Math.floor((Math.min(seconds, this.latestTime) + 1e-10) / EXPERIMENT_DT_SECONDS);
    const targetTime = targetTicks * EXPERIMENT_DT_SECONDS;
    const checkpoint = [...this.checkpoints].reverse().find(c => c.timeSeconds <= targetTime + EPSILON) || this.checkpoints[0];
    this._load(checkpoint.state);
    while (this.ticks < targetTicks) this._step(false);
    this.accumulator = 0;
    this.atHistory = this.timeSeconds < this.latestTime - EPSILON;
    return this;
  }

  snapshot() {
    return { version: 1, ticks: this.ticks, timeSeconds: this.timeSeconds, accumulator: this.accumulator, advanceSystemic: this._advanceSystemic, qualitative: clone(this.qualitative), pk: this.pk.snapshot(), neural: this.neural.snapshot(), synapse: this.synapse.snapshot(), brain: this.brain.snapshot(), cognition: this.cognition.snapshot() };
  }

  _load(state) {
    this.pk.restore(state.pk); this.neural.restore(state.neural); this.synapse.restore(state.synapse);
    if (state.brain !== undefined) this.brain.restore(state.brain);
    else this.brain.reset(42).setTargets(this.pk.stats.targets).alignTime(state.neural.timeMs);
    if (state.cognition !== undefined) this.cognition.restore(state.cognition);
    else this.cognition.initializeAt(state.timeSeconds);
    this.timeSeconds = state.timeSeconds; this.ticks = state.ticks; this.accumulator = state.accumulator;
    this._advanceSystemic = state.advanceSystemic; this.qualitative = clone(state.qualitative);
  }

  restore(snapshot) {
    // Validate and build entirely off to the side. Failed import never mutates
    // the existing experiment, its recorded history, or registered profiles.
    const encoded = JSON.stringify(snapshot);
    if (!encoded || encoded.length > 20_000_000) throw new RangeError('Checkpoint exceeds the supported size');
    const state = clone(snapshot);
    validateEngineStates(state);
    const candidate = new Experiment({ compounds: state.pk.compounds });
    candidate._load(state);
    candidate.checkpoints = []; candidate.history = []; candidate.latestTime = candidate.timeSeconds; candidate.atHistory = false;
    candidate._checkpoint();
    // Views may cache the engine objects. Preserve those identities while
    // adopting the fully validated internal state from the fresh candidate.
    for (const key of ['pk', 'neural', 'synapse', 'brain', 'cognition']) Object.assign(this[key], candidate[key]);
    for (const key of ['timeSeconds', 'ticks', 'accumulator', '_advanceSystemic', 'qualitative', 'checkpoints', 'history', 'latestTime', 'atHistory']) this[key] = candidate[key];
    return this;
  }

  exportJSON() { return { format: 'neuroscope-experiment', version: 1, state: this.snapshot() }; }

  importJSON(data) {
    const decoded = typeof data === 'string' ? JSON.parse(data) : data;
    if (!decoded || decoded.format !== 'neuroscope-experiment' || decoded.version !== 1 || !decoded.state) throw new TypeError('Unsupported experiment file');
    return this.restore(decoded.state);
  }
}
