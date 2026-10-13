/**
 * Mesoscopic serotonergic synapse model.
 *
 * Positions: nm. Time: s. Diffusion coefficient: nm²/s.
 * Serotonin concentrations: μM. Free escitalopram reservoir: nM.
 *
 * This is a well-mixed chemical master equation coupled to endpoint samples of
 * reflected Brownian motion. The nanometre-scale diffusion time (~0.5 μs across
 * 20 nm for the chosen D) is much shorter than chemical turnover. Binding uses
 * the pooled cleft concentration, NOT rendered particle proximity. Reflected
 * jumps are exact for a noninteracting particle in a rectangular box. Reactions
 * use the Gillespie direct method within each fixed presentation step.
 *
 * Rate constants are illustrative, not fitted to a patient or an experiment.
 * Drug is a chemostatted reservoir; ions, solvent, electrostatic forces,
 * allosteric binding, action potentials, and receptor-specific signaling are
 * not integrated. Clearance lumps extracellular loss into a first-order sink.
 * Receptor occupancy is not a measure of firing, mood, or therapeutic effect.
 */

export const AVOGADRO = 6.02214076e23;
export const FIXED_DT = 0.01;
export const BOUNDS = Object.freeze({ x: [-100, 100], y: [-10, 10], z: [-65, 65] });
export const VOLUME_NM3 = 200 * 20 * 130;
export const MICROMOLAR_PER_PARTICLE = 1e30 / (AVOGADRO * VOLUME_NM3);

export const DEFAULT_PARAMS = Object.freeze({
  seed: 42,
  drugConcentration: 30,
  diffusionCoefficient: 400000000,
  initialSerotonin: 120,
  transporterCount: 14,
  receptorCount: 12,
  releaseRate: 3,
  clearanceRate: 0.025,
  recyclingRate: 0.5,
  // Drug kon in nM⁻¹ s⁻¹, substrate/receptor kon in μM⁻¹ s⁻¹.
  drugOnRate: 0.08,
  drugOffRate: 0.08,
  substrateOnRate: 0.025,
  substrateOffRate: 1,
  transportRate: 2,
  receptorOnRate: 0.012,
  receptorOffRate: 3,
  maxParticles: 4000,
});

function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  return value;
}

/** Mulberry32; deterministic unsigned 32-bit PRNG (not cryptographic). */
export function seededRandom(seed = 42) {
  if (!Number.isFinite(seed)) throw new RangeError('seed must be finite');
  let state = seed >>> 0;
  const rng = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.getState = () => state;
  rng.setState = (value) => {
    if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError('RNG state must be an unsigned 32-bit integer');
    state = value;
  };
  return rng;
}

/** Standard normal via Box–Muller. No hidden cached state. */
export function gaussian(rng = Math.random) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

export function probability(rate, dt) {
  nonnegative(rate, 'rate');
  nonnegative(dt, 'dt');
  return -Math.expm1(-rate * dt);
}

export function equilibriumOccupancy(concentration, kd) {
  nonnegative(concentration, 'concentration');
  nonnegative(kd, 'kd');
  if (kd === 0) return concentration > 0 ? 1 : 0;
  return concentration / (concentration + kd);
}

export function competitiveVelocity(substrate, inhibitor, vmax, km, ki) {
  [substrate, inhibitor, vmax, km, ki].forEach((v, i) => nonnegative(v, ['substrate', 'inhibitor', 'vmax', 'km', 'ki'][i]));
  if (ki === 0) throw new RangeError('ki must be positive');
  const denominator = km * (1 + inhibitor / ki) + substrate;
  return denominator === 0 ? 0 : vmax * substrate / denominator;
}

/** One oral dose, relative concentration; time and both rate constants use hours.
 * dose / volume is a scale factor, NOT a clinical dosing recommendation.
 */
export function batemanConcentration(time, { ka = 1, ke = Math.LN2 / 30, dose = 1, volume = 1, bioavailability = 1 } = {}) {
  nonnegative(time, 'time');
  nonnegative(ka, 'ka');
  nonnegative(ke, 'ke');
  nonnegative(dose, 'dose');
  nonnegative(bioavailability, 'bioavailability');
  if (!Number.isFinite(volume) || volume <= 0) throw new RangeError('volume must be positive');
  if (ka === 0 || time === 0) return 0;
  const scale = bioavailability * dose / volume;
  if (Math.abs(ka - ke) < 1e-10) return scale * ka * time * Math.exp(-ka * time);
  // Stable and nonnegative for either rate ordering, including extreme times.
  const slow = Math.min(ka, ke);
  const difference = Math.abs(ka - ke);
  return scale * ka / difference * Math.exp(-slow * time) * -Math.expm1(-difference * time);
}

/** Method-of-images folding gives the exact reflected Brownian endpoint. */
export function reflectedCoordinate(position, lower, upper) {
  if (!Number.isFinite(position) || !Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) {
    throw new RangeError('reflection requires a finite position and increasing finite bounds');
  }
  const width = upper - lower;
  const mod = ((position - lower) % (2 * width) + 2 * width) % (2 * width);
  return lower + (mod <= width ? mod : 2 * width - mod);
}

export function brownianDisplacement(diffusionCoefficient, dt, rng = Math.random) {
  nonnegative(diffusionCoefficient, 'diffusionCoefficient');
  nonnegative(dt, 'dt');
  const sigma = Math.sqrt(2 * diffusionCoefficient * dt);
  return { x: sigma * gaussian(rng), y: sigma * gaussian(rng), z: sigma * gaussian(rng) };
}

function validateParams(params) {
  for (const [name, value] of Object.entries(params)) {
    if (!(name in DEFAULT_PARAMS)) throw new TypeError(`Unknown simulation parameter: ${name}`);
    nonnegative(value, name);
  }
  for (const name of ['initialSerotonin', 'transporterCount', 'receptorCount', 'maxParticles']) {
    if (!Number.isInteger(params[name])) throw new RangeError(`${name} must be an integer`);
  }
  if (params.initialSerotonin > params.maxParticles) throw new RangeError('initialSerotonin exceeds maxParticles');
  if (params.maxParticles > 100000) throw new RangeError('maxParticles must not exceed 100000');
  if (params.transporterCount > 10000 || params.receptorCount > 10000) throw new RangeError('actor count must not exceed 10000');
  return params;
}

function surfaceActors(count, y, kind) {
  const cols = Math.ceil(Math.sqrt(count * 1.5));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, id) => ({
    id,
    kind,
    x: cols > 1 ? -70 + (id % cols) * 140 / (cols - 1) : 0,
    y,
    z: rows > 1 ? -42 + Math.floor(id / cols) * 84 / (rows - 1) : 0,
    state: 'free',
    particleId: null,
    stateSince: 0,
    phase: 0,
  }));
}

export class Simulation {
  constructor(params = {}) {
    this.params = validateParams({ ...DEFAULT_PARAMS, ...params });
    this.reset(this.params.seed);
  }

  reset(seed = this.params.seed) {
    nonnegative(seed, 'seed');
    this.params.seed = seed;
    this.rng = seededRandom(seed);
    this.diffusionRng = seededRandom((seed >>> 0) ^ 0xa341316c);
    this.ticks = 0;
    this.time = 0;
    this.accumulator = 0;
    this.particles = [];
    this.transporters = surfaceActors(this.params.transporterCount, 10, 'sert');
    this.receptors = surfaceActors(this.params.receptorCount, -10, 'receptor');
    this.counters = { created: 0, released: 0, reuptake: 0, cleared: 0, recycled: 0, drugBindings: 0, receptorBindings: 0 };
    this.events = [];
    this.releaseBurst(this.params.initialSerotonin);
    return this;
  }

  setParams(patch) {
    const structural = ['seed', 'transporterCount', 'receptorCount', 'initialSerotonin', 'maxParticles'];
    if (Object.keys(patch).some((key) => structural.includes(key))) {
      throw new TypeError('Structural parameters must be supplied to the constructor; reset(seed) changes the seed');
    }
    this.params = validateParams({ ...this.params, ...patch });
    return this;
  }

  /** Complete JSON-serializable checkpoint, including both PRNG streams. */
  snapshot() {
    return structuredClone({
      version: 1,
      params: this.params,
      ticks: this.ticks,
      time: this.time,
      accumulator: this.accumulator,
      particles: this.particles,
      transporters: this.transporters,
      receptors: this.receptors,
      counters: this.counters,
      events: this.events,
      reactionRandomState: this.rng.getState(),
      diffusionRandomState: this.diffusionRng.getState(),
    });
  }

  /** Restore a checkpoint produced by snapshot(); caller may replay from here. */
  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1) throw new TypeError('Unsupported simulation snapshot');
    const data = structuredClone(snapshot);
    validateParams(data.params);
    if (!Number.isInteger(data.ticks) || data.ticks < 0 || data.time !== data.ticks * FIXED_DT) throw new RangeError('Invalid snapshot time');
    if (!Number.isFinite(data.accumulator) || data.accumulator < -1e-12 || data.accumulator >= FIXED_DT) throw new RangeError('Invalid snapshot accumulator');
    const reactionRng = seededRandom(data.params.seed);
    const diffusionRng = seededRandom(data.params.seed);
    reactionRng.setState(data.reactionRandomState);
    diffusionRng.setState(data.diffusionRandomState);
    for (const key of ['particles', 'transporters', 'receptors', 'events']) {
      if (!Array.isArray(data[key])) throw new TypeError(`Invalid snapshot ${key}`);
    }
    for (const key of ['params', 'ticks', 'time', 'accumulator', 'particles', 'transporters', 'receptors', 'counters', 'events']) this[key] = data[key];
    this.rng = reactionRng;
    this.diffusionRng = diffusionRng;
    return this;
  }

  _event(type, actorId = null, particleId = null, time = this.time) {
    this.events.push({ type, actorId, particleId, time });
    if (this.events.length > 256) this.events.shift();
  }

  drainEvents() {
    const result = this.events;
    this.events = [];
    return result;
  }

  _releaseParticle(particle, eventTime) {
    particle.state = 'cleft';
    particle.stateSince = eventTime;
    particle.age = 0;
    // Release from a small presynaptic active-zone disk; subsequent motion is
    // genuine diffusion endpoint sampling, not an attraction to the receptor.
    particle.x = (this.diffusionRng() - 0.5) * 30;
    particle.y = 8.5;
    particle.z = (this.diffusionRng() - 0.5) * 30;
    this.counters.released++;
    this._event('release', null, particle.id, eventTime);
  }

  releaseBurst(count = 60, eventTime = this.time) {
    nonnegative(count, 'count');
    if (!Number.isInteger(count)) throw new RangeError('count must be an integer');
    let released = 0;
    const reusable = this.particles.filter((p) => p.state === 'vesicle');
    while (released < count) {
      let particle = reusable.pop();
      if (!particle) {
        if (this.particles.length >= this.params.maxParticles) break;
        particle = { id: this.particles.length, x: 0, y: 0, z: 0, state: 'cleft', stateSince: eventTime, age: 0 };
        this.particles.push(particle);
        this.counters.created++;
      }
      this._releaseParticle(particle, eventTime);
      released++;
    }
    return released;
  }

  /** Advance by a requested amount of simulation time; the remainder is kept.
   * This has no wall-clock clamp, so equal elapsed time produces equal states
   * for different render-frame partitions. The caller owns pause and speed.
   */
  advance(dt) {
    nonnegative(dt, 'dt');
    this.accumulator += dt;
    const steps = Math.floor((this.accumulator + 1e-12) / FIXED_DT);
    for (let i = 0; i < steps; i++) this.step();
    this.accumulator -= steps * FIXED_DT;
    if (Math.abs(this.accumulator) < 1e-12) this.accumulator = 0;
    return steps;
  }

  /** One 10 ms fixed step. Reactions within it are continuous-time events. */
  step() {
    const dt = FIXED_DT;
    const sigma = Math.sqrt(2 * this.params.diffusionCoefficient * dt);
    for (const p of this.particles) {
      if (p.state !== 'cleft') continue;
      p.x = reflectedCoordinate(p.x + sigma * gaussian(this.diffusionRng), ...BOUNDS.x);
      p.y = reflectedCoordinate(p.y + sigma * gaussian(this.diffusionRng), ...BOUNDS.y);
      p.z = reflectedCoordinate(p.z + sigma * gaussian(this.diffusionRng), ...BOUNDS.z);
    }
    this._reactions(dt);
    this.time = ++this.ticks * FIXED_DT;
    for (const p of this.particles) p.age = this.time - p.stateSince;
    for (const actor of [...this.transporters, ...this.receptors]) {
      actor.phase = Math.min(1, (this.time - actor.stateSince) * this.params.transportRate);
    }
    return this.stats;
  }

  _reactions(dt) {
    let elapsed = 0;
    const params = this.params;
    const choose = (items) => items[Math.floor(this.rng() * items.length)];
    while (elapsed < dt) {
      const cleft = this.particles.filter((p) => p.state === 'cleft');
      const cytosol = this.particles.filter((p) => p.state === 'reuptaken');
      const free = this.transporters.filter((p) => p.state === 'free');
      const drug = this.transporters.filter((p) => p.state === 'drug');
      const substrate = this.transporters.filter((p) => p.state === 'substrate');
      const freeReceptors = this.receptors.filter((p) => p.state === 'free');
      const boundReceptors = this.receptors.filter((p) => p.state === 'bound');
      const concentration = cleft.length * MICROMOLAR_PER_PARTICLE;
      const canRelease = this.particles.length < params.maxParticles || this.particles.some((p) => p.state === 'vesicle');
      const rates = [
        free.length * params.drugOnRate * params.drugConcentration,
        drug.length * params.drugOffRate,
        free.length * params.substrateOnRate * concentration,
        substrate.length * params.substrateOffRate,
        substrate.length * params.transportRate,
        freeReceptors.length * params.receptorOnRate * concentration,
        boundReceptors.length * params.receptorOffRate,
        cleft.length * params.clearanceRate,
        cytosol.length * params.recyclingRate,
        canRelease ? params.releaseRate : 0,
      ];
      const total = rates.reduce((a, b) => a + b, 0);
      if (total === 0) break;
      const waiting = -Math.log(1 - this.rng()) / total;
      if (elapsed + waiting >= dt) break;
      elapsed += waiting;
      const time = this.time + elapsed;
      let selection = this.rng() * total;
      let channel = rates.length - 1;
      for (let i = 0; i < rates.length; i++) {
        selection -= rates[i];
        if (selection < 0) { channel = i; break; }
      }
      let actor, particle;
      const freeActor = (a) => {
        a.state = 'free';
        a.particleId = null;
        a.stateSince = time;
      };
      const unbind = (a, state) => {
        const p = this.particles[a.particleId];
        p.state = state;
        p.stateSince = time;
        p.x = a.x;
        p.y = a.y > 0 ? 8.5 : -8.5;
        p.z = a.z;
        freeActor(a);
        return p;
      };
      const bind = (a, p, actorState, particleState) => {
        a.state = actorState;
        a.particleId = p.id;
        a.stateSince = time;
        p.state = particleState;
        p.stateSince = time;
        p.x = a.x;
        p.y = a.y;
        p.z = a.z;
      };
      switch (channel) {
        case 0:
          actor = choose(free);
          actor.state = 'drug';
          actor.stateSince = time;
          this.counters.drugBindings++;
          this._event('drug-bind', actor.id, null, time);
          break;
        case 1:
          actor = choose(drug);
          freeActor(actor);
          this._event('drug-unbind', actor.id, null, time);
          break;
        case 2:
          actor = choose(free);
          particle = choose(cleft);
          bind(actor, particle, 'substrate', 'sert');
          this._event('substrate-bind', actor.id, particle.id, time);
          break;
        case 3:
          actor = choose(substrate);
          particle = unbind(actor, 'cleft');
          this._event('substrate-unbind', actor.id, particle.id, time);
          break;
        case 4:
          actor = choose(substrate);
          particle = unbind(actor, 'reuptaken');
          particle.y = 15;
          this.counters.reuptake++;
          this._event('reuptake', actor.id, particle.id, time);
          break;
        case 5:
          actor = choose(freeReceptors);
          particle = choose(cleft);
          bind(actor, particle, 'bound', 'receptor');
          this.counters.receptorBindings++;
          this._event('receptor-bind', actor.id, particle.id, time);
          break;
        case 6:
          actor = choose(boundReceptors);
          particle = unbind(actor, 'cleft');
          this._event('receptor-unbind', actor.id, particle.id, time);
          break;
        case 7:
          particle = choose(cleft);
          particle.state = 'cleared';
          particle.stateSince = time;
          this.counters.cleared++;
          this._event('clearance', null, particle.id, time);
          break;
        case 8:
          particle = choose(cytosol);
          particle.state = 'vesicle';
          particle.stateSince = time;
          particle.y = 24;
          this.counters.recycled++;
          this._event('recycle', null, particle.id, time);
          break;
        case 9:
          this.releaseBurst(1, time);
          break;
      }
    }
  }

  get stats() {
    const counts = { cleft: 0, sert: 0, receptor: 0, reuptaken: 0, vesicle: 0, cleared: 0 };
    for (const p of this.particles) counts[p.state]++;
    const boundDrug = this.transporters.filter((p) => p.state === 'drug').length;
    const boundSubstrate = this.transporters.filter((p) => p.state === 'substrate').length;
    const boundReceptors = this.receptors.filter((p) => p.state === 'bound').length;
    return {
      time: this.time,
      ...this.counters,
      cleft: counts.cleft,
      serotonin: counts.cleft,
      availableSerotonin: counts.cleft,
      serotoninConcentration: counts.cleft * MICROMOLAR_PER_PARTICLE,
      boundDrug,
      boundSubstrate,
      boundReceptors,
      transporterCount: this.transporters.length,
      receptorCount: this.receptors.length,
      receptorActivity: this.receptors.length ? boundReceptors / this.receptors.length : 0,
      occupancy: this.transporters.length ? boundDrug / this.transporters.length : 0,
      cytosolic: counts.reuptaken,
      vesicular: counts.vesicle,
      stateCounts: counts,
      conserved: Object.values(counts).reduce((a, b) => a + b, 0) === this.counters.created,
      drugConcentration: this.params.drugConcentration,
    };
  }
}
