/**
 * Schematic association-region Wilson–Cowan-type E/I rate network.
 * tau_E dE/dt=-E+S(wEE E-wEI I+coupling+P+drive+noise), and similarly I.
 * We use bounded exponential relaxation with each substep's input held fixed.
 * Sources justify the model family, not these deliberately assumed parameters:
 * Wilson & Cowan (1972): https://pmc.ncbi.nlm.nih.gov/articles/PMC1484078/
 * Association networks: https://pmc.ncbi.nlm.nih.gov/articles/PMC3174820/
 * Coordinates, edges, delays and receptor densities below are schematic;
 * they are not a registered atlas, measured connectome or receptor PET map.
 * The baseline removes direct drug modulation but shares the current cognitive
 * drive, including its drug-dependent changes. It is not an independent
 * untreated/no-drug counterfactual. Legacy baseline* API names are retained.
 * There is no sensory input or measure of consciousness in this module.
 */
import { seededRandom, gaussian } from './simulation.js';

const clone = value => structuredClone(value);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sigmoid = x => 1 / (1 + Math.exp(-clamp(x, -60, 60)));
const TARGETS = ['SERT', 'DAT', 'NET', 'D2', 'HT2A', 'HT1A', 'GABAA', 'NMDA', 'ADENOSINE', 'NACHR'];
const finite = (x, name, min = -Infinity, max = Infinity) => {
  if (!Number.isFinite(x) || x < min || x > max) throw new RangeError(`Invalid brain ${name}`);
  return x;
};
const integer = (x, name, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  finite(x, name, min, max);
  if (!Number.isSafeInteger(x)) throw new RangeError(`Invalid brain ${name}`);
  return x;
};

const definitions = [
  ['dlpfc', 'Dorsolateral prefrontal cortex', 'executive', [40, 36, 30], 'Working-memory and executive-control association region'],
  ['vmpfc', 'Ventromedial prefrontal cortex', 'default', [8, 48, -12], 'Valuation and internally directed association processing'],
  ['ofc', 'Orbitofrontal cortex', 'valuation', [30, 30, -18], 'Outcome valuation and flexible association processing'],
  ['acc', 'Anterior cingulate cortex', 'salience', [8, 28, 25], 'Control and salience-related association processing'],
  ['pcc', 'Posterior cingulate cortex', 'default', [8, -48, 28], 'Internally directed association-network hub'],
  ['precuneus', 'Precuneus', 'default', [12, -62, 46], 'Higher association and internally directed processing'],
  ['ipl', 'Inferior parietal association cortex', 'association', [48, -54, 38], 'Multimodal association; primary sensory cortex is excluded'],
  ['ifg', 'Inferior frontal association cortex', 'language', [46, 22, 12], 'Language and response-selection association processing'],
  ['temporal', 'Lateral temporal association cortex', 'language', [54, -30, -12], 'Conceptual and semantic association; primary auditory cortex is excluded'],
  ['hippocampus', 'Hippocampus', 'memory', [26, -22, -16], 'Relational memory association'],
  ['amygdala', 'Amygdala', 'limbic', [22, -4, -18], 'Affective relevance and learned associations'],
  ['striatum', 'Associative striatum', 'valuation', [16, 10, 6], 'Association-loop selection and reinforcement'],
  ['md_thalamus', 'Mediodorsal thalamus', 'executive', [8, -14, 10], 'Prefrontal association-loop relay'],
  ['cerebellum', 'Cognitive cerebellar territory', 'executive', [32, -66, -36], 'Schematic cognitive association territory; motor and sensory loops excluded'],
];

function densities(id, network) {
  // Relative dimensionless sensitivity weights, not measured receptor density.
  const d = { SERT: 0.7, DAT: 0.5, NET: 0.8, D2: 0.5, HT2A: 0.8, HT1A: 0.7, GABAA: 1, NMDA: 1, ADENOSINE: 0.8, NACHR: 0.7 };
  if (['default', 'association', 'executive'].includes(network)) { d.HT2A = 1.2; d.NMDA = 1.1; }
  if (id === 'hippocampus') { d.HT1A = 1.4; d.NMDA = 1.3; }
  if (id === 'amygdala') { d.HT1A = 1.2; d.GABAA = 1.2; }
  if (id === 'striatum') { d.D2 = 1.6; d.DAT = 1.6; d.HT2A = 0.5; }
  if (id === 'raphe') { d.SERT = 1.4; d.HT1A = 1.6; d.HT2A = 0.3; }
  if (id === 'lc') { d.NET = 1.5; d.HT2A = 0.3; }
  return Object.freeze(d);
}

export const REGIONS = Object.freeze([
  ...definitions.flatMap(([id, name, network, position, role]) => ['l', 'r'].map(side => Object.freeze({
    id: `${id}_${side}`, name: `${side === 'l' ? 'Left' : 'Right'} ${name}`, network,
    position: Object.freeze([position[0] * (side === 'l' ? -1 : 1), position[1], position[2]]), role,
    receptorDensities: densities(id, network), densityEvidence: 'Assumed relative sensitivity weights; not measured receptor density',
  }))),
  ...[['raphe', 'Dorsal raphe', [0, -28, -18]], ['lc', 'Locus coeruleus (lumped)', [0, -36, -26]]].map(([id, name, position]) => Object.freeze({
    id, name, position: Object.freeze(position), network: 'modulatory', role: 'Lumped modulatory population; E/I reduction is an illustrative abstraction',
    receptorDensities: densities(id, 'modulatory'), densityEvidence: 'Assumed relative sensitivity weights; not measured receptor density',
  })),
]);

const edges = [];
function connect(from, to, weight, delayMs, reciprocal = true) {
  edges.push(Object.freeze({ from, to, weight, delayMs }));
  if (reciprocal) edges.push(Object.freeze({ from: to, to: from, weight, delayMs }));
}
for (const [id] of definitions) connect(`${id}_l`, `${id}_r`, 0.3, 12);
for (const side of ['l', 'r']) {
  for (const [a, b, w, d] of [
    ['dlpfc', 'ipl', 0.8, 14], ['dlpfc', 'acc', 0.7, 6], ['dlpfc', 'ifg', 0.6, 5],
    ['dlpfc', 'md_thalamus', 0.8, 8], ['dlpfc', 'striatum', 0.6, 8], ['striatum', 'md_thalamus', 0.6, 6],
    ['vmpfc', 'pcc', 0.8, 18], ['pcc', 'precuneus', 0.8, 5], ['pcc', 'ipl', 0.6, 8],
    ['pcc', 'hippocampus', 0.7, 12], ['vmpfc', 'hippocampus', 0.6, 12],
    ['ofc', 'vmpfc', 0.7, 6], ['ofc', 'amygdala', 0.7, 9], ['ofc', 'striatum', 0.7, 8],
    ['acc', 'amygdala', 0.5, 10], ['acc', 'vmpfc', 0.5, 6], ['amygdala', 'hippocampus', 0.6, 5],
    ['ifg', 'temporal', 0.8, 12], ['temporal', 'ipl', 0.6, 8], ['temporal', 'hippocampus', 0.6, 6],
    ['cerebellum', 'md_thalamus', 0.5, 18], ['cerebellum', 'dlpfc', 0.4, 24],
  ]) connect(`${a}_${side}`, `${b}_${side}`, w, d);
  // These are effective population couplings, not reconstructed axon bundles.
  for (const target of ['dlpfc', 'acc', 'hippocampus', 'amygdala']) connect('raphe', `${target}_${side}`, 0.2, 20, false);
  for (const target of ['dlpfc', 'acc', 'ipl', 'hippocampus']) connect('lc', `${target}_${side}`, 0.2, 18, false);
}
export const CONNECTIONS = Object.freeze(edges);
export const BRAIN_DT_MS = 0.5;
export const BRAIN_DEFAULTS = Object.freeze({ seed: 42, dtMs: BRAIN_DT_MS, tauEMs: 20, tauIMs: 10, noiseAmplitude: 0.025, couplingStrength: 0.7 });
const INDEX = new Map(REGIONS.map((region, index) => [region.id, index]));
const ID_SET = new Set(INDEX.keys());

function normalizedTargets(targets = {}) {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) throw new TypeError('Invalid brain targets');
  const result = {};
  for (const id of TARGETS) {
    if (targets[id] === undefined) continue;
    const entry = targets[id];
    if (!entry || typeof entry !== 'object') throw new TypeError('Invalid brain target');
    result[id] = {};
    if (entry.activity !== undefined) result[id].activity = finite(entry.activity, 'target activity', 0, 1);
    if (entry.delta !== undefined) result[id].delta = finite(entry.delta, 'target delta', -1, 1);
  }
  return result;
}

export function regionalModulation(targets = {}) {
  const normalized = normalizedTargets(targets);
  const delta = id => normalized[id]?.delta ?? 0;
  const blockade = id => normalized[id]?.activity === undefined ? 0 : 1 - normalized[id].activity;
  return REGIONS.map(({ id, receptorDensities: d }) => {
    const gaba = Math.max(0, delta('GABAA')) * d.GABAA;
    const nmda = Math.max(0, -delta('NMDA')) * d.NMDA;
    // All coefficients/signs are a hypothesis at the population scale, not
    // universal receptor actions. Transporter blockade is a bounded proxy.
    return {
      id,
      excitatoryBias: clamp(0.2 * d.SERT * blockade('SERT') + 0.5 * d.DAT * blockade('DAT') + 0.5 * d.NET * blockade('NET') + 1.8 * d.HT2A * delta('HT2A') - 1.1 * d.HT1A * delta('HT1A') - 0.4 * d.D2 * delta('D2') + d.NACHR * delta('NACHR') - d.ADENOSINE * delta('ADENOSINE') - 0.6 * gaba, -3, 3),
      inhibitoryBias: clamp(0.4 * d.NACHR * delta('NACHR') - 0.7 * nmda, -2, 2),
      excitatoryGain: clamp(1 - 0.55 * nmda, 0.2, 1.5),
      inhibitoryGain: clamp(1 + 1.5 * gaba, 0.5, 3),
    };
  });
}

export class BrainSimulation {
  constructor(options = {}) {
    this.options = { ...BRAIN_DEFAULTS, ...options };
    integer(this.options.seed, 'seed', 0, 0xffffffff);
    if (![0.25, 0.5, 1].includes(this.options.dtMs)) throw new RangeError('Brain dtMs must be 0.25, 0.5 or 1');
    finite(this.options.tauEMs, 'E time constant', 2, 1000); finite(this.options.tauIMs, 'I time constant', 2, 1000);
    finite(this.options.noiseAmplitude, 'noise amplitude', 0, 2); finite(this.options.couplingStrength, 'coupling strength', 0, 5);
    this.connections = CONNECTIONS;
    this.incoming = REGIONS.map(region => CONNECTIONS.filter(edge => edge.to === region.id).map(edge => ({ from: INDEX.get(edge.from), weight: edge.weight, delayTicks: Math.round(edge.delayMs / this.options.dtMs) })));
    this.historyLength = Math.round(Math.max(...CONNECTIONS.map(edge => edge.delayMs)) / this.options.dtMs) + 1;
    this.reset();
  }

  reset(seed = this.options.seed) {
    integer(seed, 'seed', 0, 0xffffffff); this.options.seed = seed;
    const rng = seededRandom(seed);
    this.rng = seededRandom((seed ^ 0x52b42a17) >>> 0);
    this.regions = REGIONS.map(({ id }) => { const e = 0.18 + rng() * 0.04; const i = 0.18 + rng() * 0.04; return { id, e, i, baselineE: e, baselineI: i }; });
    this.timeMs = 0; this.ticks = 0; this.accumulator = 0; this.lastNoiseTick = -1;
    this.noise = REGIONS.map(() => 0); this.drive = {}; this.targets = {};
    this.modulation = regionalModulation();
    this.historyIndex = 0;
    this.history = Array.from({ length: this.historyLength }, () => this.regions.map(region => region.e));
    this.baselineHistory = clone(this.history);
    this.migrationNote = null;
    return this;
  }

  setTargets(targets = {}) {
    const normalized = normalizedTargets(targets);
    this.targets = normalized; this.modulation = regionalModulation(normalized);
    return this;
  }

  setDrive(drive = {}) {
    if (!drive || typeof drive !== 'object' || Array.isArray(drive)) throw new TypeError('Invalid internal brain drive');
    const next = {};
    for (const [id, value] of Object.entries(drive)) {
      if (!ID_SET.has(id)) throw new TypeError(`Unknown brain region: ${id}`);
      next[id] = finite(value, 'internal drive', -3, 3);
    }
    this.drive = next;
    return this;
  }

  advance(ms) {
    finite(ms, 'duration', 0);
    this.accumulator += ms;
    const count = Math.floor((this.accumulator + 1e-9) / this.options.dtMs);
    for (let n = 0; n < count; n++) this.step();
    this.accumulator -= count * this.options.dtMs;
    if (Math.abs(this.accumulator) < 1e-9) this.accumulator = 0;
    return count;
  }

  step() {
    const dt = this.options.dtMs;
    const noiseTick = Math.floor(this.ticks * dt / 5);
    if (noiseTick !== this.lastNoiseTick) { this.noise = REGIONS.map(() => gaussian(this.rng) * this.options.noiseAmplitude); this.lastNoiseTick = noiseTick; }
    const relaxationE = -Math.expm1(-dt / this.options.tauEMs);
    const relaxationI = -Math.expm1(-dt / this.options.tauIMs);
    const updates = this.regions.map((region, index) => {
      const incoming = this.incoming[index];
      const normalization = incoming.reduce((sum, edge) => sum + Math.abs(edge.weight), 0) || 1;
      const coupled = history => this.options.couplingStrength * incoming.reduce((sum, edge) => sum + edge.weight * (history[(this.historyIndex - edge.delayTicks + this.historyLength) % this.historyLength][edge.from] - 0.2), 0) / normalization;
      const evolve = (e, i, baseline) => {
        const m = baseline ? { excitatoryBias: 0, inhibitoryBias: 0, excitatoryGain: 1, inhibitoryGain: 1 } : this.modulation[index];
        const drive = this.drive[region.id] || 0;
        const eInput = 10 * e * m.excitatoryGain - 8 * i * m.inhibitoryGain + coupled(baseline ? this.baselineHistory : this.history) + 1 + drive + m.excitatoryBias + this.noise[index] - 2.8;
        const iInput = 8 * e * m.excitatoryGain - 3 * i + 0.4 + 0.25 * drive + m.inhibitoryBias + 0.7 * this.noise[index] - 2.8;
        return [e + relaxationE * (sigmoid(eInput) - e), i + relaxationI * (sigmoid(iInput) - i)];
      };
      return [...evolve(region.e, region.i, false), ...evolve(region.baselineE, region.baselineI, true)];
    });
    for (let index = 0; index < this.regions.length; index++) [this.regions[index].e, this.regions[index].i, this.regions[index].baselineE, this.regions[index].baselineI] = updates[index];
    this.historyIndex = (this.historyIndex + 1) % this.historyLength;
    this.history[this.historyIndex] = this.regions.map(region => region.e);
    this.baselineHistory[this.historyIndex] = this.regions.map(region => region.baselineE);
    this.timeMs = ++this.ticks * dt;
    return this;
  }

  get stats() {
    const sum = this.regions.reduce((total, region) => total + region.e, 0);
    const meanActivity = sum / this.regions.length;
    const baselineActivity = this.regions.reduce((total, region) => total + region.baselineE, 0) / this.regions.length;
    const entropy = sum === 0 ? 0 : -this.regions.reduce((total, region) => { const p = region.e / sum; return total + (p > 0 ? p * Math.log(p) : 0); }, 0) / Math.log(this.regions.length);
    return {
      timeMs: this.timeMs, meanActivity, baselineActivity, activityDelta: meanActivity - baselineActivity, activityEntropy: entropy,
      regional: this.regions.map((region, index) => ({ ...region, name: REGIONS[index].name, network: REGIONS[index].network, delta: region.e - region.baselineE })),
      modulation: { regional: clone(this.modulation) },
      interpretation: 'Normalized schematic population activity. Baseline removes direct drug modulation while sharing the current cognitive drive, including drug-dependent drive changes; it is not an independent untreated/no-drug counterfactual. Entropy describes the spatial activity distribution, not consciousness. Coordinates, connectivity, receptor weights and drug-to-rate mappings are assumed. No sensory inputs.',
      migrationNote: this.migrationNote,
    };
  }

  /** Import migration only: old files contain no historical regional states. */
  alignTime(ms) {
    finite(ms, 'migration time', 0);
    this.ticks = Math.floor((ms + 1e-9) / this.options.dtMs); this.timeMs = this.ticks * this.options.dtMs;
    this.accumulator = Math.max(0, ms - this.timeMs); this.lastNoiseTick = -1;
    this.migrationNote = 'Legacy experiment: regional populations initialized at import; earlier regional history was not recorded.';
    return this;
  }

  snapshot() {
    return clone({ version: 1, options: this.options, ticks: this.ticks, timeMs: this.timeMs, accumulator: this.accumulator, rngState: this.rng.getState(), regions: this.regions, noise: this.noise, lastNoiseTick: this.lastNoiseTick, drive: this.drive, targets: this.targets, historyIndex: this.historyIndex, history: this.history, baselineHistory: this.baselineHistory, migrationNote: this.migrationNote });
  }

  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !snapshot.options) throw new TypeError('Unsupported brain checkpoint');
    const state = clone(snapshot);
    const candidate = new BrainSimulation(state.options);
    integer(state.ticks, 'ticks'); finite(state.timeMs, 'time', 0); finite(state.accumulator, 'remainder', 0, candidate.options.dtMs);
    if (state.accumulator >= candidate.options.dtMs || Math.abs(state.timeMs - state.ticks * candidate.options.dtMs) > 1e-8) throw new RangeError('Invalid brain clock');
    integer(state.rngState, 'RNG state', 0, 0xffffffff);
    integer(state.lastNoiseTick, 'noise tick', -1, Math.floor(state.timeMs / 5));
    integer(state.historyIndex, 'history index', 0, candidate.historyLength - 1);
    if (state.migrationNote !== null && (typeof state.migrationNote !== 'string' || state.migrationNote.length > 500)) throw new TypeError('Invalid brain migration note');
    if (!Array.isArray(state.regions) || state.regions.length !== REGIONS.length || !Array.isArray(state.noise) || state.noise.length !== REGIONS.length) throw new TypeError('Invalid brain population count');
    for (let index = 0; index < REGIONS.length; index++) {
      const region = state.regions[index];
      if (!region || region.id !== REGIONS[index].id) throw new TypeError('Invalid brain region identity');
      for (const key of ['e', 'i', 'baselineE', 'baselineI']) finite(region[key], 'population activity', 0, 1);
      finite(state.noise[index], 'noise', -100, 100);
    }
    for (const key of ['history', 'baselineHistory']) {
      if (!Array.isArray(state[key]) || state[key].length !== candidate.historyLength) throw new TypeError('Invalid brain delay history');
      for (const row of state[key]) {
        if (!Array.isArray(row) || row.length !== REGIONS.length) throw new TypeError('Invalid brain delay population count');
        row.forEach(value => finite(value, 'delay activity', 0, 1));
      }
      for (let index = 0; index < REGIONS.length; index++) if (state[key][state.historyIndex][index] !== state.regions[index][key === 'history' ? 'e' : 'baselineE']) throw new RangeError('Brain delay history does not match present state');
    }
    candidate.setTargets(state.targets); candidate.setDrive(state.drive);
    for (const key of ['ticks', 'timeMs', 'accumulator', 'regions', 'noise', 'lastNoiseTick', 'historyIndex', 'history', 'baselineHistory', 'migrationNote']) candidate[key] = state[key];
    candidate.rng.setState(state.rngState);
    Object.assign(this, candidate);
    return this;
  }
}
