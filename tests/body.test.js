import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBodySystem, createCorticalNetwork } from '../src/body.js';

function close(actual, expected, message) {
  assert.ok(actual.distanceTo(expected) < 1e-9, `${message}: ${actual.toArray()} vs ${expected.toArray()}`);
}

test('circulation and blood–brain barrier expose distinct display scales and usable organ handles', () => {
  const system = createBodySystem();
  assert.equal(system.circulation.parent, system.group);
  assert.equal(system.barrier.parent, system.group);
  assert.equal(system.circulation.visible, true);
  assert.equal(system.barrier.visible, false, 'magnified capillary is initially hidden to avoid mixing scales');
  assert.notEqual(system.circulation.userData.displayScale, system.barrier.userData.displayScale);
  assert.equal(system.organs.kidneys.length, 2);
  assert.equal(system.organs.lungs.length, 2);
  for (const name of ['brain', 'heart', 'liver']) assert.equal(system.organs[name].parent, system.circulation);
  system.group.updateMatrixWorld(true);
  close(system.organs.brain.getWorldPosition(new THREE.Vector3()), system.brainPosition, 'brain focus target matches its geometry');
  assert.equal(system.bloodPath.closed, true);
  close(system.bloodPath.getPointAt(0), system.bloodPath.getPointAt(1), 'systemic particle loop closes');
  assert.equal(system.barrierBloodPath.closed, false);
  assert.ok(system.barrierBloodPath.getPointAt(0).x < system.barrierBloodPath.getPointAt(1).x, 'capillary particle path flows along the lumen');
  for (const path of [system.bloodPath, system.barrierBloodPath]) {
    for (let sample = 0; sample <= 100; sample++) {
      assert.ok(path.getPointAt(sample / 100).toArray().every(Number.isFinite));
      const tangent = path.getTangentAt(sample / 100);
      assert.ok(tangent.toArray().every(Number.isFinite));
      assert.ok(Math.abs(tangent.length() - 1) < 1e-9);
    }
  }
});

test('magnified neurovascular unit has endothelial layer, sealing junctions and exterior support cells', () => {
  const system = createBodySystem();
  assert.equal(system.endothelialCells.length, 18);
  assert.equal(system.tightJunctions.length, 7);
  assert.equal(system.astrocytes.length, 2);
  assert.equal(system.pericytes.length, 1);
  assert.equal(system.bloodCells.length, 8);
  for (const object of [...system.endothelialCells, ...system.tightJunctions, ...system.astrocytes, ...system.pericytes, ...system.bloodCells]) {
    assert.equal(object.parent, system.barrier);
    assert.ok(object.userData.label);
    assert.ok(object.userData.description);
  }
  // Endothelial patches must remain on the cylindrical wall, rather than
  // accidentally filling/obstructing the blood lumen after a mesh transform.
  for (const cell of system.endothelialCells) {
    const positions = cell.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      assert.ok(Math.abs(Math.hypot(positions.getY(i), positions.getZ(i)) - 17) < 1e-5);
      assert.ok(positions.getZ(i) <= 1e-5, 'front half stays open as an intentional cutaway');
    }
  }
});

test('cortical rendering uses supplied IDs, E/I classes, directed topology and weights without mutation', () => {
  const neurons = [
    { id: 2, type: 'I', x: 5, y: 9, z: -1 },
    { id: 0, type: 'E', x: -3, y: 2, z: 4 },
    { id: 1, type: 'E', x: 1, y: -2, z: 0 },
  ];
  const connections = [{ from: 2, to: 0, weight: -4 }, { from: 0, to: 1, weight: 2.3 }];
  const original = JSON.stringify({ neurons, connections });
  const network = createCorticalNetwork(3, { neurons, connections });
  assert.equal(network.nodes.length, 3);
  assert.equal(network.edges.length, connections.length);
  const { center, scale } = network.group.userData.positionTransform;
  for (const neuron of neurons) {
    const node = network.nodes[neuron.id];
    assert.equal(node.isMesh, true);
    assert.equal(node.userData.id, neuron.id, 'mesh array is indexed by neuron ID, not source array position');
    assert.equal(node.userData.type, neuron.type);
    assert.ok(node.material.emissive instanceof THREE.Color, 'main animation can directly control neural activity');
    close(node.position, new THREE.Vector3(neuron.x, neuron.y, neuron.z).sub(new THREE.Vector3(...center)).multiplyScalar(scale), 'uniform position transform preserves layout');
  }
  assert.notEqual(network.nodes[0].material, network.nodes[1].material, 'spiking one neuron cannot recolor another by shared material');
  connections.forEach((connection, index) => {
    const edge = network.edges[index];
    assert.equal(edge.userData.from, connection.from);
    assert.equal(edge.userData.to, connection.to);
    assert.equal(edge.userData.weight, connection.weight);
    assert.equal(edge.userData.sourceType, neurons.find(neuron => neuron.id === connection.from).type);
    close(edge.userData.curve.getPoint(0), network.nodes[connection.from].position, 'axon starts at its modeled source');
    close(edge.userData.curve.getPoint(1), network.nodes[connection.to].position, 'axon ends at its modeled target');
  });
  assert.equal(JSON.stringify({ neurons, connections }), original);
  const isolated = createCorticalNetwork(3, { neurons, connections: [] });
  assert.equal(isolated.edges.length, 0, 'an explicitly empty topology must stay empty');
});

test('cortical fallback is deterministic and invalid external topology fails clearly', () => {
  const a = createCorticalNetwork(12), b = createCorticalNetwork(12);
  assert.deepEqual(a.neurons, b.neurons);
  assert.deepEqual(a.connections, b.connections);
  assert.equal(a.nodes.length, 12);
  assert.ok(a.nodes.some(node => node.userData.type === 'E'));
  assert.ok(a.nodes.some(node => node.userData.type === 'I'));
  assert.throws(() => createCorticalNetwork(1, { neurons: [{ id: 2, type: 'E', x: 0, y: 0, z: 0 }] }), /contiguous/);
  assert.throws(() => createCorticalNetwork(1, { neurons: [{ id: 0, type: 'E', x: NaN, y: 0, z: 0 }] }), /finite/);
  assert.throws(() => createCorticalNetwork(1, { neurons: [{ id: 0, type: 'E', x: 0, y: 0, z: 0 }], connections: [{ from: 0, to: 3, weight: 1 }] }), /missing neuron/);
});

test('body, barrier and cortical scenes have finite renderable geometry within compact display bounds', () => {
  const system = createBodySystem();
  const network = createCorticalNetwork();
  const checked = new Set();
  for (const root of [system.circulation, system.barrier, network.group]) {
    root.updateMatrixWorld(true);
    let meshes = 0;
    root.traverse(object => {
      assert.ok(object.matrixWorld.elements.every(Number.isFinite));
      if (!object.isMesh) return;
      meshes++;
      if (checked.has(object.geometry)) return;
      checked.add(object.geometry);
      for (const attribute of ['position', 'normal']) {
        const data = object.geometry.getAttribute(attribute)?.array;
        if (data) assert.ok(data.every(Number.isFinite), `${object.name} ${attribute} must be finite`);
      }
      object.geometry.computeBoundingSphere();
      assert.ok(Number.isFinite(object.geometry.boundingSphere.radius));
    });
    assert.ok(meshes > 30, 'a populated anatomical scene is returned');
    const dimensions = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    assert.ok(dimensions.toArray().every(dimension => dimension > 0 && dimension < 220), 'scene fits the intended ~200-unit camera range');
  }
});
