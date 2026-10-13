import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const molecules = JSON.parse(readFileSync(new URL('../public/data/molecules.json', import.meta.url))).molecules;
const sert = JSON.parse(readFileSync(new URL('../public/data/sert.json', import.meta.url)));
const xyz = p => [p.x, p.y, p.z];
const minus = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const distance = (a, b) => Math.hypot(...minus(xyz(a), xyz(b)));
function signedVolume(atoms, priority) {
  const points = priority.map(i => xyz(atoms[i]));
  return dot(cross(minus(points[0], points[3]), minus(points[1], points[3])), minus(points[2], points[3]));
}

for (const [key, expected] of Object.entries({
  escitalopram: { formula: { C: 20, H: 22, F: 1, N: 2, O: 1 }, charge: 1, cid: 40466954 },
  serotonin: { formula: { C: 10, H: 13, N: 2, O: 1 }, charge: 1, cid: 4048638 },
  oxalate: { formula: { C: 2, O: 4 }, charge: -2, cid: 71081 },
})) {
  test(`${key}: authentic protonation, formula, connectivity and bond geometry`, () => {
    const molecule = molecules[key];
    assert.equal(molecule.cid, expected.cid);
    assert.equal(molecule.units, 'angstrom');
    const counts = {};
    molecule.atoms.forEach((a, i) => {
      assert.equal(a.id, i);
      assert.ok(xyz(a).every(Number.isFinite));
      counts[a.element] = (counts[a.element] ?? 0) + 1;
    });
    assert.deepEqual(counts, expected.formula);
    assert.equal(molecule.atoms.reduce((n, a) => n + a.charge, 0), expected.charge);
    assert.equal(molecule.charge, expected.charge);
    const valences = Array(molecule.atoms.length).fill(0);
    const edges = new Set();
    const adjacency = molecule.atoms.map(() => []);
    for (const b of molecule.bonds) {
      assert.ok(Number.isInteger(b.a) && Number.isInteger(b.b));
      assert.ok(b.a >= 0 && b.a < molecule.atoms.length);
      assert.ok(b.b >= 0 && b.b < molecule.atoms.length && b.a !== b.b);
      assert.ok([1, 2, 3].includes(b.order));
      const edge = [b.a, b.b].sort((a, b) => a - b).join('-');
      assert.ok(!edges.has(edge), `duplicate bond ${edge}`);
      edges.add(edge);
      valences[b.a] += b.order;
      valences[b.b] += b.order;
      adjacency[b.a].push(b.b);
      adjacency[b.b].push(b.a);
      const length = distance(molecule.atoms[b.a], molecule.atoms[b.b]);
      assert.ok(length > 0.85 && length < 1.8, `implausible small-molecule bond length ${length} Å`);
    }
    const visited = new Set([0]);
    const pending = [0];
    while (pending.length) {
      for (const neighbor of adjacency[pending.pop()]) {
        if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
      }
    }
    assert.equal(visited.size, molecule.atoms.length, 'each species is a connected molecule');
    molecule.atoms.forEach((a, i) => {
      const expectedValence = { C: 4, H: 1, F: 1, N: a.charge === 1 ? 4 : 3, O: a.charge === -1 ? 1 : 2 }[a.element];
      assert.equal(valences[i], expectedValence, `atom ${i} ${a.element} formal valence`);
    });
    assert.match(molecule.provenance.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(molecule.provenance.conformerId, /^[a-fA-F0-9]+$/);
    for (const key of ['x', 'y', 'z']) {
      assert.ok(Math.abs(molecule.atoms.reduce((sum, a) => sum + a[key], 0) / molecule.atoms.length) < 1e-5);
    }
  });
}

test('escitalopram preserves independently verified S chirality, which a mirror reverses', () => {
  // CIP order was independently assigned by RDKit from PubChem SDF 3D coordinates.
  // The determinant alone is not a general-purpose CIP assignment algorithm.
  const mol = molecules.escitalopram;
  const center = mol.stereochemistry.centers[0];
  assert.equal(mol.stereochemistry.centers.length, 1);
  assert.equal(center.configuration, 'S');
  assert.equal(center.atomId, 4);
  assert.deepEqual(center.neighborsCipPriority, [1, 6, 8, 5]);
  assert.equal(mol.atoms[center.atomId].element, 'C');
  const neighbors = mol.bonds.filter(b => b.a === center.atomId || b.b === center.atomId).map(b => b.a === center.atomId ? b.b : b.a).sort((a, b) => a - b);
  assert.deepEqual(neighbors, [...center.neighborsCipPriority].sort((a, b) => a - b));
  const volume = signedVolume(mol.atoms, center.neighborsCipPriority);
  assert.ok(volume > 8 && volume < 13, 'S-handed non-planar tetrahedral geometry');
  assert.ok(Math.abs(volume - center.signedTripleProduct) < 1e-5);
  const reflected = mol.atoms.map(a => ({ ...a, x: -a.x }));
  assert.ok(signedVolume(reflected, center.neighborsCipPriority) < 0, 'reflection changes handedness');
  const translated = mol.atoms.map(a => ({ ...a, x: a.x + 100, y: a.y - 4, z: a.z + 20 }));
  assert.ok(Math.abs(signedVolume(translated, center.neighborsCipPriority) - volume) < 1e-10);
});

test('serotonin is protonated at its side-chain amine, not the indole nitrogen', () => {
  const mol = molecules.serotonin;
  const ammonium = mol.atoms.filter(a => a.element === 'N' && a.charge === 1);
  assert.equal(ammonium.length, 1);
  const attached = mol.bonds.filter(b => b.a === ammonium[0].id || b.b === ammonium[0].id)
    .map(b => mol.atoms[b.a === ammonium[0].id ? b.b : b.a].element).sort();
  assert.deepEqual(attached, ['C', 'H', 'H', 'H']);
});

test('SERT asset preserves experimental backbone and bound ligand in one coordinate frame', () => {
  assert.equal(sert.pdbId, '5I71');
  assert.equal(sert.chain, 'A');
  assert.equal(sert.units, 'angstrom');
  assert.equal(sert.resolutionAngstrom, 3.15);
  assert.equal(sert.residues.length, 542);
  const listed = sert.segments.flat();
  assert.equal(new Set(listed).size, sert.residues.length);
  for (const segment of sert.segments) {
    for (let i = 1; i < segment.length; i++) {
      const a = sert.residues[segment[i - 1]], b = sert.residues[segment[i]];
      assert.equal(b.resSeq, a.resSeq + 1);
      assert.ok(distance(a, b) > 2.5 && distance(a, b) < 4.5, 'no artificial peptide bridge across missing density');
    }
  }
  const bound = sert.ligands.find(l => l.resName === '68P');
  assert.equal(bound.atoms.length, 24);
  assert.equal(bound.bonds.length, 26);
  assert.equal(bound.atoms.filter(a => a.element === 'F').length, 1);
  assert.equal(sert.ligands.filter(l => l.resName === 'NA').length, 2);
  assert.ok(sert.pocketResidueNumbers.includes(98), 'central-site Asp98 included');
  assert.ok(sert.pocketResidueNumbers.includes(439), 'ts3 Ser439 binding-site residue included');
  for (const atom of sert.pocketAtoms) assert.ok(xyz(atom).every(Number.isFinite));
  assert.ok(sert.pocketAtoms.some(a => Math.min(...bound.atoms.map(b => distance(a, b))) < 4));
});
