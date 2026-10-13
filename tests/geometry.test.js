import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildMolecule, buildSert } from '../src/structures.js';
import { createSynapseAnatomy, createNeuronNetwork } from '../src/neuron.js';

const molecules = JSON.parse(readFileSync(new URL('../public/data/molecules.json', import.meta.url))).molecules;
const sertData = JSON.parse(readFileSync(new URL('../public/data/sert.json', import.meta.url)));
const vector = atom => new THREE.Vector3(atom.x, atom.y, atom.z);
const atomMesh = (group, id) => group.children.find(object => object.userData.type === 'atom' && object.userData.atomId === id);
const worldPosition = object => object.getWorldPosition(new THREE.Vector3());
function effectivelyVisible(object) {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}
function closeVector(actual, expected, message, tolerance = 1e-10) {
  assert.ok(actual.distanceTo(expected) < tolerance, `${message}: ${actual.toArray()} versus ${expected.toArray()}`);
}
function determinant(points) {
  return points[0].clone().sub(points[3]).cross(points[1].clone().sub(points[3])).dot(points[2].clone().sub(points[3]));
}

for (const [key, molecule] of Object.entries(molecules)) {
  test(`${key} renderer preserves source coordinates, IDs, elements and uniform scale`, () => {
    const before = JSON.stringify(molecule);
    const scale = 2.35;
    const group = buildMolecule(molecule, { scale });
    group.updateMatrixWorld(true);
    for (const atom of molecule.atoms) {
      const mesh = atomMesh(group, atom.id);
      assert.ok(mesh, `rendered atom ${atom.id} exists`);
      assert.equal(mesh.userData.element, atom.element);
      closeVector(mesh.position, vector(atom), `local atom ${atom.id} is unchanged`);
      closeVector(worldPosition(mesh), vector(atom).multiplyScalar(scale), `world atom ${atom.id} scales exactly once`);
    }
    for (const bond of molecule.bonds) {
      const original = vector(molecule.atoms[bond.a]).distanceTo(vector(molecule.atoms[bond.b]));
      const rendered = worldPosition(atomMesh(group, bond.a)).distanceTo(worldPosition(atomMesh(group, bond.b)));
      assert.ok(Math.abs(rendered - original * scale) < 1e-10, `bond ${bond.a}–${bond.b} length preserves uniform scaling`);
    }
    assert.equal(JSON.stringify(molecule), before, 'renderer does not mutate source data');
  });
}

test('hydrogen toggling reaches atom meshes, bond groups and every bond cylinder', () => {
  const data = molecules.escitalopram;
  const group = buildMolecule(data, { hydrogens: false });
  const hydrogenIds = new Set(data.atoms.filter(atom => atom.element === 'H').map(atom => atom.id));
  let hiddenAtoms = 0;
  for (const atom of data.atoms) {
    const mesh = atomMesh(group, atom.id);
    assert.equal(mesh.userData.hydrogen, hydrogenIds.has(atom.id));
    assert.equal(effectivelyVisible(mesh), !hydrogenIds.has(atom.id));
    if (hydrogenIds.has(atom.id)) hiddenAtoms++;
  }
  assert.equal(hiddenAtoms, 22);
  for (const object of group.children.filter(child => child.userData.type === 'bond')) {
    const expected = hydrogenIds.has(object.userData.a) || hydrogenIds.has(object.userData.b);
    object.traverse(child => {
      assert.equal(child.userData.hydrogen, expected, 'all bond drawing parts carry the same hydrogen tag');
      assert.equal(effectivelyVisible(child), !expected);
    });
  }
  // This is the same public tag contract used by the UI checkbox. Restore and
  // hide again to catch children that can get stuck behind a hidden bond group.
  for (const visible of [true, false, true]) {
    group.traverse(object => { if (object.userData.hydrogen) object.visible = visible; });
    group.traverse(object => {
      if (object.userData.hydrogen) assert.equal(effectivelyVisible(object), visible);
      else assert.equal(effectivelyVisible(object), true, 'heavy atoms and bonds stay visible');
    });
  }
});

test('renderer preserves S handedness under display scaling and rigid rotation', () => {
  const data = molecules.escitalopram;
  const center = data.stereochemistry.centers[0];
  const scale = 1.7;
  const group = buildMolecule(data, { scale });
  const stereoAtom = atomMesh(group, center.atomId);
  assert.equal(stereoAtom.userData.configuration, 'S');
  assert.match(stereoAtom.userData.label, /S stereocenter/);
  assert.equal(group.children.filter(object => object.userData.configuration === 'S').length, 1);
  group.rotation.set(0.8, -0.6, 1.4);
  group.position.set(10, -3, 7);
  group.updateMatrixWorld(true);
  const volume = determinant(center.neighborsCipPriority.map(id => worldPosition(atomMesh(group, id))));
  assert.ok(volume > 0, 'display transform does not mirror the verified S conformer');
  assert.ok(Math.abs(volume - center.signedTripleProduct * scale ** 3) < 1e-7);
  assert.throws(() => buildMolecule(data, { scale: -1 }), /positive/, 'negative display scaling cannot silently mirror a molecule');
});

test('bond cylinders align with molecular bonds using their quaternion transforms', () => {
  const data = molecules.serotonin;
  const group = buildMolecule(data);
  group.updateMatrixWorld(true);
  for (const bond of group.children.filter(object => object.userData.type === 'bond')) {
    const a = vector(data.atoms[bond.userData.a]);
    const b = vector(data.atoms[bond.userData.b]);
    const axis = b.clone().sub(a).normalize();
    for (const cylinder of bond.children) {
      const from = new THREE.Vector3(0, -0.5, 0).applyMatrix4(cylinder.matrixWorld);
      const to = new THREE.Vector3(0, 0.5, 0).applyMatrix4(cylinder.matrixWorld);
      const direction = to.clone().sub(from).normalize();
      assert.ok(direction.dot(axis) > 1 - 1e-10, 'cylinder points from bond atom A toward atom B');
      const lo = from.clone().sub(a).dot(axis);
      const hi = to.clone().sub(a).dot(axis);
      assert.ok(lo >= -1e-10 && hi <= a.distanceTo(b) + 1e-10, 'half-bond cylinder stays between the supplied atom planes');
    }
  }
});

test('SERT protein, binding pocket, ligand and sodium preserve the deposited common frame', () => {
  const before = JSON.stringify(sertData);
  const group = buildSert(sertData);
  const center = new THREE.Vector3(...sertData.center);
  group.updateMatrixWorld(true);
  assert.equal(group.userData.pdbId, '5I71');
  assert.equal(group.userData.units, 'angstrom');
  for (const ligand of sertData.ligands) {
    const assembly = group.children.find(child => child.userData.residueNumber === ligand.resSeq);
    assert.ok(assembly, `ligand ${ligand.resSeq} exists`);
    closeVector(assembly.position, center.clone().negate(), 'ligand translated by the protein center only');
    assert.deepEqual(assembly.scale.toArray(), [1, 1, 1], 'ligand is not independently enlarged');
    for (const atom of ligand.atoms) {
      closeVector(worldPosition(atomMesh(assembly, atom.id)), vector(atom).sub(center), `deposited ligand ${ligand.resSeq} atom ${atom.id}`);
    }
    if (ligand.resName === 'NA') {
      assert.equal(assembly.userData.type, 'ion');
      assert.equal(atomMesh(assembly, 0).userData.charge, 1);
    }
  }
  const pocket = group.children.find(child => child.userData.type === 'binding-pocket');
  assert.equal(pocket.children.length, sertData.pocketAtoms.length);
  for (const atom of sertData.pocketAtoms) {
    const mesh = pocket.children.find(child => child.userData.atomId === atom.id);
    closeVector(worldPosition(mesh), vector(atom).sub(center), `pocket atom ${atom.id}`);
  }
  assert.equal(JSON.stringify(sertData), before, 'SERT rendering does not alter deposited data');
});

test('all molecular, experimental-protein and anatomical geometry has finite coordinates and transforms', () => {
  const anatomy = createSynapseAnatomy();
  const roots = [...Object.values(molecules).map(data => buildMolecule(data)), buildSert(sertData), anatomy.group, createNeuronNetwork()];
  const checkedGeometry = new Set();
  let meshCount = 0;
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse(object => {
      assert.ok(object.matrixWorld.elements.every(Number.isFinite), `${object.name} has a finite world transform`);
      if (!object.isMesh) return;
      meshCount++;
      if (!checkedGeometry.has(object.geometry)) {
        checkedGeometry.add(object.geometry);
        for (const attribute of ['position', 'normal']) {
          const values = object.geometry.getAttribute(attribute)?.array;
          if (values) assert.ok(values.every(Number.isFinite), `${object.name} ${attribute} values are finite`);
        }
      }
      if (object.isInstancedMesh) assert.ok(object.instanceMatrix.array.every(Number.isFinite), 'all lipid/cargo instance transforms are finite');
    });
    const bounds = new THREE.Box3().setFromObject(root);
    assert.equal(bounds.isEmpty(), false);
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
  }
  assert.ok(meshCount > 500, 'all rich scenes were instantiated');
  assert.equal(anatomy.vesicles.length, 10);
  assert.equal(anatomy.calciumChannels.length, 4);
  assert.equal(anatomy.mitochondria.length, 2);
});
