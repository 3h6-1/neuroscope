import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../public/data/compound-catalog.json', import.meta.url)));
const structures = JSON.parse(readFileSync(new URL('../public/data/compound-structures.json', import.meta.url))).molecules;
const compounds = new Map(catalog.compounds.map(c => [c.id, c]));
const xyz = atom => [atom.x, atom.y, atom.z];
const subtract = (a, b) => a.map((x, i) => x - b[i]);
const distance = (a, b) => Math.hypot(...subtract(xyz(a), xyz(b)));
function determinant(atoms, priority) {
  const [p, q, r, base] = priority.map(id => xyz(atoms[id]));
  const [a, b, c] = [p, q, r].map(point => subtract(point, base));
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

const expected = {
  escitalopram: { cid: 146570, structureCid: 40466954, formula: { C: 20, H: 22, F: 1, N: 2, O: 1 }, charge: 1 },
  aripiprazole: { cid: 60795, formula: { C: 23, H: 27, Cl: 2, N: 3, O: 2 }, charge: 0 },
  bupropion: { cid: 444, formula: { C: 13, H: 18, Cl: 1, N: 1, O: 1 }, charge: 0 },
  cyanocobalamin: { cid: 166596686, formula: { C: 63, H: 88, Co: 1, N: 14, O: 14, P: 1 }, charge: 0 },
  lsd: { cid: 5761, formula: { C: 20, H: 25, N: 3, O: 1 }, charge: 0 },
  caffeine: { cid: 2519, formula: { C: 8, H: 10, N: 4, O: 2 }, charge: 0 },
  nicotine: { cid: 89594, formula: { C: 10, H: 14, N: 2 }, charge: 0 },
  diazepam: { cid: 3016, formula: { C: 16, H: 13, Cl: 1, N: 2, O: 1 }, charge: 0 },
  ketamine: { cid: 3821, formula: { C: 13, H: 16, Cl: 1, N: 1, O: 1 }, charge: 0 },
  fluoxetine: { cid: 3386, formula: { C: 17, H: 18, F: 3, N: 1, O: 1 }, charge: 0 },
};

test('catalog has ten distinct, identified compounds and unambiguous required aliases', () => {
  assert.equal(compounds.size, 10);
  assert.equal(catalog.compounds.length, 10);
  for (const [id, identity] of Object.entries(expected)) {
    const entry = compounds.get(id);
    assert.ok(entry);
    assert.equal(entry.cid, identity.cid);
    assert.equal(entry.structureCid, identity.structureCid ?? identity.cid);
    assert.ok(entry.name && entry.class && entry.notes.length);
    assert.ok(Array.isArray(entry.pathway));
    assert.equal(typeof entry.qualitativeExposureSupported, 'boolean');
    assert.ok(Number.isFinite(entry.molecularWeight) && entry.molecularWeight > 0);
  }
  assert.ok(compounds.get('bupropion').aliases.includes('bupropion HCl'));
  assert.ok(compounds.get('bupropion').aliases.includes('bupropion hydrochloride'));
  assert.ok(compounds.get('lsd').aliases.includes('LSD-25'));
  assert.ok(compounds.get('lsd').aliases.includes('lysergide'));
  assert.ok(compounds.get('cyanocobalamin').aliases.includes('B12'));
  assert.equal(compounds.get('cyanocobalamin').name, 'Cyanocobalamin (B12)');
});

test('every modeled parameter distinguishes empirical support from assumptions', () => {
  const allowedTargets = new Set(['SERT', 'DAT', 'NET', 'D2', 'HT2A', 'HT1A', 'GABAA', 'NMDA', 'ADENOSINE', 'NACHR']);
  const actions = new Set(['inhibitor', 'antagonist', 'agonist', 'partial_agonist', 'pam', 'channel_blocker', 'cofactor']);
  for (const c of compounds.values()) {
    const sourceIds = new Set(c.sources.map(s => s.id));
    const checkEvidence = e => {
      assert.ok(e && e.type && e.note);
      for (const id of e.sourceIds) assert.ok(sourceIds.has(id), `${c.id}: missing evidence source ${id}`);
    };
    for (const t of c.targets) {
      assert.ok(allowedTargets.has(t.target));
      assert.ok(actions.has(t.action));
      assert.ok(Number.isFinite(t.kiNM) && t.kiNM > 0);
      assert.ok(Number.isFinite(t.efficacy) && t.efficacy >= 0 && t.efficacy <= 1);
      assert.ok(['assay', 'illustrative'].includes(t.evidenceType));
      assert.equal(t.modelAssumption, t.evidenceType === 'illustrative');
      assert.ok(t.affinityLabel.includes(t.modelAssumption ? 'K*' : 'Ki'));
      checkEvidence(t.evidence);
      checkEvidence(t.efficacyEvidence);
      assert.equal(t.efficacyEvidence.type, 'illustrative', 'efficacy coefficient must not be mistaken for a measured clinical effect');
      if (t.evidenceType === 'assay') assert.ok(t.evidence.sourceIds.length > 0);
    }
    checkEvidence(c.metabolism.evidence);
    if (!c.simulationSupported) continue;
    assert.ok(c.pk.halfLifeH > 0 && Number.isFinite(c.pk.halfLifeH));
    assert.ok(c.pk.freeFraction >= 0 && c.pk.freeFraction <= 1);
    assert.ok(c.pk.brainPartition > 0 && c.pk.brainEquilibrationH > 0);
    for (const key of ['halfLifeH', 'freeFraction', 'brainPartition', 'brainEquilibrationH']) checkEvidence(c.pk.evidence[key]);
    assert.equal(c.pk.evidence.brainPartition.type, 'illustrative');
    assert.equal(c.pk.evidence.brainEquilibrationH.type, 'illustrative');
  }
});

test('cyanocobalamin has no invented acute receptor or one-compartment PK model', () => {
  const c = compounds.get('cyanocobalamin');
  assert.equal(c.modelType, 'cofactor');
  assert.equal(c.simulationSupported, false);
  assert.equal(c.pk, null);
  assert.equal(c.qualitativeExposureSupported, true);
  assert.equal(c.pathway.length, 5);
  const sourceIds = new Set(c.sources.map(s => s.id));
  for (const stage of c.pathway) {
    assert.ok(stage.stage && stage.description);
    assert.ok(stage.sourceIds.length > 0);
    for (const id of stage.sourceIds) assert.ok(sourceIds.has(id));
  }
  assert.match(c.qualitativeExposureNote, /unknown, rather than zero/);
  assert.deepEqual(c.targets, []);
  const molecule = structures.cyanocobalamin;
  assert.equal(molecule.dimension, 2);
  assert.equal(molecule.unavailable3D, true);
  assert.equal(c.structureDimension, 2);
  assert.equal(c.unavailable3D, true);
  assert.equal(molecule.units, '2D depiction units');
  assert.ok(molecule.atoms.every(a => a.z === 0));
  assert.equal(molecule.atoms.filter(a => a.element === 'Co').length, 1);
  assert.deepEqual(molecule.stereochemistry.centers, []);
});

test('CYP interaction identities and receptor actions are pharmacologically distinct', () => {
  assert.ok(compounds.get('bupropion').metabolism.inhibits.includes('CYP2D6'));
  assert.ok(compounds.get('aripiprazole').metabolism.substrate.includes('CYP2D6'));
  assert.ok(compounds.get('aripiprazole').metabolism.substrate.includes('CYP3A4'));
  assert.ok(compounds.get('bupropion').metabolism.substrate.includes('CYP2B6'));
  assert.equal(compounds.get('aripiprazole').targets.find(t => t.target === 'D2').action, 'partial_agonist');
  assert.equal(compounds.get('diazepam').targets[0].action, 'pam');
  assert.equal(compounds.get('ketamine').targets[0].action, 'channel_blocker');
  assert.equal(compounds.get('bupropion').targets.find(t => t.target === 'NET').evidenceType, 'illustrative', 'IC50 must not silently become assay Ki');
  assert.ok(catalog.interactionEvidence.every(e => e.quantitativeStatus));
});

for (const [id, identity] of Object.entries(expected)) {
  test(`${id}: coordinate source, composition, bonds and explicit dimension remain consistent`, () => {
    const c = compounds.get(id), m = structures[id];
    assert.equal(m.cid, c.structureCid);
    assert.equal(m.parentCid, c.cid);
    assert.equal(m.dimension, c.structureDimension);
    assert.match(m.provenance.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(m.provenance.sourceSdfSha256, /^[a-f0-9]{64}$/);
    assert.equal(m.provenance.provider, 'PubChem / NCBI');
    const counts = {}, valences = m.atoms.map(() => 0), connected = m.atoms.map(() => []), edges = new Set();
    m.atoms.forEach((a, i) => {
      assert.equal(a.id, i);
      assert.ok(xyz(a).every(Number.isFinite));
      counts[a.element] = (counts[a.element] ?? 0) + 1;
    });
    assert.deepEqual(counts, identity.formula);
    assert.equal(m.charge, identity.charge);
    assert.equal(m.atoms.reduce((sum, a) => sum + a.charge, 0), identity.charge);
    for (const b of m.bonds) {
      assert.ok(Number.isInteger(b.a) && Number.isInteger(b.b));
      assert.ok(m.atoms[b.a] && m.atoms[b.b] && b.a !== b.b);
      assert.ok([1, 2, 3].includes(b.order));
      const edge = [b.a, b.b].sort((a, b) => a - b).join('-');
      assert.ok(!edges.has(edge));
      edges.add(edge);
      valences[b.a] += b.order; valences[b.b] += b.order;
      connected[b.a].push(b.b); connected[b.b].push(b.a);
      if (m.dimension === 3) assert.ok(distance(m.atoms[b.a], m.atoms[b.b]) > 0.8 && distance(m.atoms[b.a], m.atoms[b.b]) < 1.95);
    }
    if (m.dimension === 3) {
      assert.equal(m.unavailable3D, false);
      assert.equal(m.units, 'angstrom');
      const visited = new Set([0]), stack = [0];
      while (stack.length) for (const next of connected[stack.pop()]) if (!visited.has(next)) { visited.add(next); stack.push(next); }
      assert.equal(visited.size, m.atoms.length);
      m.atoms.forEach((a, i) => {
        const valence = { C: 4, H: 1, N: a.charge === 1 ? 4 : 3, O: a.charge === -1 ? 1 : 2, F: 1, Cl: 1 }[a.element];
        assert.equal(valences[i], valence, `${id} ${a.element} atom ${i}: formal valence`);
      });
    }
  });
}

test('specified stereoisomers match independently assigned 3D CIP geometry', () => {
  for (const [id, labels] of [['escitalopram', ['S']], ['lsd', ['R', 'R']], ['nicotine', ['S']]]) {
    const m = structures[id];
    assert.equal(m.stereochemistry.parentIsStereochemicallySpecified, true);
    assert.deepEqual(m.stereochemistry.centers.map(c => c.configuration), labels);
    for (const c of m.stereochemistry.centers) {
      const value = determinant(m.atoms, c.neighborsCipPriority);
      assert.ok(Math.abs(value) > 1);
      assert.ok(Math.abs(value - c.signedTripleProduct) < 1e-5);
      const reflected = m.atoms.map(a => ({ ...a, x: -a.x }));
      assert.ok(value * determinant(reflected, c.neighborsCipPriority) < 0);
    }
  }
});

test('racemic or unspecified parent structures are not relabeled as enantiopure', () => {
  for (const id of ['bupropion', 'ketamine', 'fluoxetine']) {
    const m = structures[id];
    assert.equal(m.stereochemistry.parentIsStereochemicallySpecified, false);
    assert.deepEqual(m.stereochemistry.centers, []);
    assert.equal(m.stereochemistry.representativeConformerCenters.length, 1);
    assert.match(m.notes, /racemic|unspecified/i);
  }
});
