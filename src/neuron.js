import * as THREE from 'three';

// Mesoscale anatomy is an illustrative cutaway, not an EM reconstruction.
// Distances in this synapse scene are nanometres; the overview uses arbitrary
// display units because soma, axon and synapse cannot share a useful viewport.
const COLORS = {
  pre: 0x60c7be, post: 0x9b91db, membrane: 0x6cd9ce,
  vesicle: 0x7fded0, serotonin: 0xf4ba71, calcium: 0x8aa9f4,
  mitochondrion: 0xcb8175, cristae: 0xf2aa91, actin: 0xb0a5e6,
};

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.57, metalness: 0.1, ...extra });
}

function label(object, name, description, type = 'anatomy') {
  object.name = name;
  object.userData = { ...object.userData, label: name, description, type };
  return object;
}

function sphere(radius, mat, position = [0, 0, 0], detail = 18) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, detail, Math.max(8, Math.round(detail * 0.67))), mat);
  mesh.position.set(...position);
  return mesh;
}

function tube(points, radius, mat, segments = 44, radial = 9) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radial, false), mat);
}

function cylinderBetween(a, b, radius, mat, radial = 8) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), radial), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function deterministic(index, seed = 1) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function membrane(y, color, upper) {
  const group = label(new THREE.Group(), upper ? 'Presynaptic plasma membrane' : 'Postsynaptic plasma membrane',
    'A phospholipid bilayer, drawn as two hydrophilic head-group layers surrounding hydrophobic tails. Lipid packing is schematic.');
  const faceMat = material(color, { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const face = new THREE.Mesh(new THREE.BoxGeometry(194, 3.7, 116), faceMat);
  face.position.y = y + (upper ? 1.85 : -1.85);
  group.add(face);
  const headMat = material(color, { roughness: 0.45 });
  const tailMat = material(color, { transparent: true, opacity: 0.32, depthWrite: false });
  const locations = [];
  let index = 0;
  for (let x = -94; x <= 94; x += 6.25) {
    for (let z = -55; z <= 55; z += 6.25) {
      locations.push([x + (deterministic(index, 2) - 0.5) * 1.6, z + (deterministic(index++, 7) - 0.5) * 1.6]);
    }
  }
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.88, 8, 6), headMat, locations.length * 2);
  const tails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 2.55, 5), tailMat, locations.length * 2);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < locations.length; i++) {
    const [x, z] = locations[i];
    for (let j = 0; j < 2; j++) {
      matrix.makeTranslation(x, y + (upper ? 1 : -1) * j * 3.7, z);
      heads.setMatrixAt(i * 2 + j, matrix);
      matrix.makeTranslation(x + (j === 0 ? -0.31 : 0.31), y + (upper ? 1.85 : -1.85), z);
      tails.setMatrixAt(i * 2 + j, matrix);
    }
  }
  heads.instanceMatrix.needsUpdate = true;
  tails.instanceMatrix.needsUpdate = true;
  group.add(heads, tails);
  // Cut edges make the bilayer legible without covering the molecular cleft.
  for (const z of [-57, 57]) {
    const edge = tube([[-96, y + (upper ? 1.85 : -1.85), z], [0, y + (upper ? 1.85 : -1.85), z], [96, y + (upper ? 1.85 : -1.85), z]], 0.38, headMat, 4, 6);
    group.add(edge);
  }
  return group;
}

function rearShell(centerY, scale, color, name) {
  // Rear half only: front-facing cytoplasm remains visible in cutaway.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 36, 24, Math.PI, Math.PI),
    material(color, { transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false }),
  );
  shell.position.y = centerY;
  shell.scale.set(...scale);
  return label(shell, name, 'The translucent rear cell surface frames an open-front anatomical cutaway.');
}

function createVesicle(position, index, docked = false) {
  const group = label(new THREE.Group(), docked ? 'Docked serotonin vesicle' : 'Serotonin storage vesicle',
    'A lipid vesicle containing serotonin. A calcium-triggered fusion event releases transmitter at the presynaptic active zone. Vesicle size and cargo count are reduced for readability.');
  group.position.set(...position);
  const radius = docked ? 7.5 : 7.3 + deterministic(index, 19) * 1.8;
  const shell = sphere(radius, material(COLORS.vesicle, { transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
  group.add(shell);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.29, 6, 36), material(COLORS.vesicle));
  rim.rotation.x = Math.PI * 0.12;
  group.add(rim);
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.67, 7, 5), material(COLORS.serotonin, { emissive: COLORS.serotonin, emissiveIntensity: 0.1 }), 16);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) {
    const phi = i * 2.399963229728653;
    const cosTheta = 1 - 2 * ((i + 0.5) / 16);
    const radial = radius * (0.35 + 0.37 * deterministic(i, index + 1));
    const planar = Math.sqrt(1 - cosTheta ** 2);
    matrix.makeTranslation(radial * planar * Math.cos(phi), radial * cosTheta, radial * planar * Math.sin(phi));
    beads.setMatrixAt(i, matrix);
  }
  beads.instanceMatrix.needsUpdate = true;
  group.add(beads);
  if (docked) {
    const neck = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.6, 8, 20), material(COLORS.vesicle));
    neck.rotation.x = Math.PI / 2;
    neck.position.y = -radius + 0.4;
    group.add(neck);
    label(neck, 'Vesicle docking site', 'Schematic fusion-neck position. Vesicle fusion requires SNARE machinery and a local calcium signal.');
  }
  return group;
}

function createMitochondrion(position, rotation = 0) {
  const group = label(new THREE.Group(), 'Presynaptic mitochondrion',
    'Mitochondria supply ATP and help buffer calcium. Internal folds are cristae of the inner mitochondrial membrane. This small fragment is drawn for anatomical context.');
  group.position.set(...position);
  group.rotation.z = rotation;
  const shell = sphere(1, material(COLORS.mitochondrion, { transparent: true, opacity: 0.31, depthWrite: false, side: THREE.DoubleSide }), [0, 0, 0], 28);
  shell.scale.set(20, 7.5, 7.5);
  group.add(shell);
  const coreMat = material(COLORS.cristae, { roughness: 0.8 });
  for (let i = 0; i < 7; i++) {
    const x = -14 + i * 4.4;
    const extent = 5.7 * Math.sqrt(Math.max(0.1, 1 - (x / 20) ** 2));
    group.add(tube([[x - 1, -extent, 0], [x + 1.4, -extent * 0.5, 2.6], [x - 1.3, extent * 0.45, 2], [x + 0.5, extent, -0.8]], 0.63, coreMat, 16, 6));
  }
  return group;
}

function createCalciumChannel(x, z) {
  const group = label(new THREE.Group(), 'Voltage-gated calcium channel',
    'An arriving action potential opens calcium channels. Calcium entry activates synaptotagmin and promotes SNARE-mediated vesicle fusion. This channel is schematic, not an atomic protein structure.');
  group.position.set(x, 11.8, z);
  const mat = material(COLORS.calcium, { emissive: COLORS.calcium, emissiveIntensity: 0.09 });
  for (let j = 0; j < 4; j++) {
    const angle = j * Math.PI / 2;
    const helix = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 4.4, 4, 8), mat);
    helix.position.set(Math.cos(angle) * 1.65, 0, Math.sin(angle) * 1.65);
    group.add(helix);
  }
  return group;
}

export function createSynapseAnatomy() {
  const group = label(new THREE.Group(), 'Serotonergic synapse cutaway',
    'Illustrative neuron ultrastructure surrounding a 20 nm cleft. Cell and organelle shapes are schematic; neurotransmitter and drug structures are supplied separately.');
  const presynaptic = label(new THREE.Group(), 'Presynaptic bouton',
    'The axon terminal stores and releases serotonin and contains SERT transporters that return extracellular serotonin to the presynaptic cytoplasm.');
  const postsynaptic = label(new THREE.Group(), 'Postsynaptic dendritic spine',
    'The receiving membrane carries serotonin receptors. Serotonin receptors have multiple subtypes and signaling effects; the depicted receptor response is a generic occupancy indicator.');
  presynaptic.add(membrane(10, COLORS.pre, true), rearShell(55, [110, 45, 69], COLORS.pre, 'Bouton cutaway surface'));
  postsynaptic.add(membrane(-10, COLORS.post, false), rearShell(-38, [110, 28, 69], COLORS.post, 'Spine-head cutaway surface'));

  const axonMat = material(COLORS.pre, { transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const axon = tube([[1, 79, -34], [6, 99, -52], [13, 122, -65], [12, 147, -76]], 12, axonMat, 36, 20);
  presynaptic.add(label(axon, 'Axon entering the bouton', 'The axon conducts an action potential to the presynaptic terminal.'));
  const microMat = material(0x649e99, { transparent: true, opacity: 0.62, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 3;
    presynaptic.add(label(tube([[x + 13, 144, -76], [x + 14, 121, -63], [x + 7, 95, -50], [x + 2, 71, -32], [x - 13, 62, -18]], 0.62, microMat, 36, 7),
      'Axonal microtubule', 'Microtubules support axonal architecture and intracellular cargo transport. The visible bundle is schematic.'));
  }

  const spineMat = material(COLORS.post, { transparent: true, opacity: 0.21, side: THREE.DoubleSide, depthWrite: false });
  const neck = tube([[0, -51, -17], [0, -65, -19], [6, -80, -21]], 10, spineMat, 18, 20);
  postsynaptic.add(label(neck, 'Dendritic spine neck', 'The narrow spine neck links the spine head to the parent dendrite.'));
  const dendrite = tube([[-137, -91, -32], [-70, -87, -24], [3, -82, -21], [74, -88, -18], [135, -86, -26]], 13, spineMat, 40, 20);
  postsynaptic.add(label(dendrite, 'Parent dendrite', 'The parent dendrite receives and integrates inputs.'));

  const actinMat = material(COLORS.actin, { transparent: true, opacity: 0.44, depthWrite: false });
  for (let i = 0; i < 18; i++) {
    const x = -87 + i * 10;
    const z = -42 + deterministic(i, 42) * 72;
    postsynaptic.add(label(tube([[x, -17, z], [x * 0.82, -28, z * 0.85], [x * 0.5, -39, z * 0.5], [x * 0.13, -58, -16]], 0.46, actinMat, 24, 5),
      'Spine actin filament', 'A branched actin cytoskeleton supports the dendritic spine and contributes to changes in spine shape.'));
    if (i % 2 === 0) postsynaptic.add(tube([[x * 0.82, -28, z * 0.85], [x + 9, -22, z + 7], [x + 17, -17, z + 12]], 0.32, actinMat, 10, 5));
  }

  const density = new THREE.Mesh(new THREE.BoxGeometry(134, 1.5, 64), material(0x8578b7, { transparent: true, opacity: 0.18, depthWrite: false }));
  density.position.set(0, -16.2, -2);
  postsynaptic.add(label(density, 'Postsynaptic signaling scaffold', 'A schematic membrane-associated protein scaffold. Serotonergic contacts vary in morphology and many act through volume transmission rather than a classical spine synapse.'));

  const vesicles = [
    [-69, 40, -24], [-40, 52, 6], [-14, 38, -35], [16, 54, -15],
    [45, 35, -25], [72, 48, -9], [-65, 65, -35], [51, 67, -31],
    [-42, 21, 22], [21, 21, 26],
  ].map((position, index) => createVesicle(position, index, index > 7));
  vesicles.forEach(v => presynaptic.add(v));
  const calciumChannels = [[-52, 28], [-30, 23], [11, 29], [32, 23]].map(([x, z]) => createCalciumChannel(x, z));
  calciumChannels.forEach(c => presynaptic.add(c));
  const mitochondria = [createMitochondrion([-33, 79, -33], 0.16), createMitochondrion([61, 82, -43], -0.32)];
  mitochondria.forEach(m => presynaptic.add(m));

  const activeZone = label(new THREE.Group(), 'Presynaptic active zone',
    'A schematic arrangement of docking proteins near calcium channels. Serotonin release is represented by discrete vesicle events.');
  const dockMat = material(0x93d6c3, { transparent: true, opacity: 0.48, depthWrite: false });
  for (const [x, z] of [[-42, 22], [21, 26]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.5, 6, 28), dockMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 14.3, z);
    activeZone.add(ring);
  }
  presynaptic.add(activeZone);
  group.add(presynaptic, postsynaptic);
  return { group, presynaptic, postsynaptic, vesicles, calciumChannels, mitochondria };
}

function taperedBranch(points, startRadius, endRadius, mat) {
  // Sweep a circular cross-section over a spline with smoothly tapered radius.
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geometry = new THREE.TubeGeometry(curve, 36, 1, 9, false);
  const positions = geometry.attributes.position;
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const center = curve.getPointAt(t);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, t);
    for (let j = 0; j <= 9; j++) {
      const idx = i * 10 + j;
      positions.setXYZ(idx,
        center.x + (positions.getX(idx) - center.x) * radius,
        center.y + (positions.getY(idx) - center.y) * radius,
        center.z + (positions.getZ(idx) - center.z) * radius);
    }
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, mat);
}

function networkCell(center, color, seed, second = false) {
  const cell = label(new THREE.Group(), second ? 'Receiving neuron' : 'Serotonergic neuron',
    'Schematic morphology: soma, nucleus, branching dendrites, and an axon. This is not a reconstructed neuron; brain serotonergic projections often signal beyond a single synaptic contact.');
  cell.position.set(...center);
  const mat = material(color, { roughness: 0.58 });
  const soma = sphere(19, material(color, { transparent: true, opacity: 0.54, side: THREE.DoubleSide, depthWrite: false }), [0, 0, 0], 32);
  soma.scale.set(1.14, 0.91, 1);
  label(soma, 'Neuron soma', 'The cell body contains the nucleus and organelles that maintain the neuron.');
  const nucleus = sphere(8.3, material(second ? 0x65588f : 0x355f69), [-2, 1, 3], 24);
  label(nucleus, 'Nucleus', 'The nucleus contains the genome and regulates gene expression.');
  cell.add(soma, nucleus);
  const nucleolus = sphere(2.8, material(second ? 0xb6a0e4 : 0x8dc8c3), [-1, 2, 9], 16);
  cell.add(nucleolus);
  for (let arm = 0; arm < 6; arm++) {
    const angle = (arm / 6) * Math.PI * 2 + (second ? 0.26 : 0.1);
    const vec = new THREE.Vector3(Math.cos(angle), Math.sin(angle), (deterministic(arm, seed) - 0.5) * 0.95).normalize();
    const reach = 43 + deterministic(arm, seed + 1) * 18;
    const p = (r, z = 0) => [vec.x * r, vec.y * r, vec.z * r + z];
    const branch = taperedBranch([p(13), p(24, 2), p(reach * 0.78, 3), p(reach, 0)], 4.2, 1.35, mat);
    cell.add(label(branch, 'Primary dendrite', 'Dendrites branch to receive synaptic input. Many excitatory contacts occur on dendritic spines.'));
    for (const fork of [-1, 1]) {
      const origin = new THREE.Vector3(...p(reach));
      const direction = new THREE.Vector3(Math.cos(angle + fork * 0.5), Math.sin(angle + fork * 0.5), vec.z + fork * 0.3).normalize();
      const endpoint = origin.clone().addScaledVector(direction, 32 + deterministic(arm, seed + 4) * 17);
      const mid = origin.clone().lerp(endpoint, 0.55);
      mid.z += fork * 5;
      const distal = taperedBranch([origin.toArray(), mid.toArray(), endpoint.toArray()], 1.55, 0.36, mat);
      cell.add(label(distal, 'Dendritic branch', 'An illustrative tapering dendritic arbor.'));
      for (let spineIndex = 1; spineIndex < 5; spineIndex++) {
        const t = spineIndex / 5;
        const root = origin.clone().lerp(endpoint, t);
        const outward = new THREE.Vector3(-direction.y, direction.x, 0.3).multiplyScalar((spineIndex % 2 ? 1 : -1) * 3.4);
        const head = root.clone().add(outward);
        cell.add(cylinderBetween(root, head, 0.38, mat, 5));
        cell.add(label(sphere(1.1, mat, head.toArray(), 9), 'Dendritic spine', 'A small membrane protrusion supported by actin, shown schematically.'));
      }
    }
  }
  return cell;
}

export function createNeuronNetwork() {
  const group = label(new THREE.Group(), 'Neuron-scale overview',
    'Schematic multiscale overview. Display units differ from the nanometre synapse scene. Soma, arbor, unmyelinated axon, varicosities, and synaptic terminal are deliberately compressed to show their relationship.');
  const source = networkCell([-135, 30, -2], COLORS.pre, 11);
  const target = networkCell([154, -32, -10], COLORS.post, 31, true);
  group.add(source, target);
  const axonPoints = [[-119, 18, -2], [-86, -10, 10], [-57, -32, 18], [-15, -31, 5], [30, -12, -4], [66, 12, 0], [95, 17, 5]];
  const axonCurve = new THREE.CatmullRomCurve3(axonPoints.map(p => new THREE.Vector3(...p)));
  const axon = new THREE.Mesh(new THREE.TubeGeometry(axonCurve, 100, 2.2, 10, false), material(COLORS.pre));
  group.add(label(axon, 'Unmyelinated serotonergic projection axon',
    'A thin unmyelinated axon carries electrical signals along a serotonergic projection. Its display width and length are schematic; swellings along it represent varicosities.'));
  const varicosityMat = material(0x8acfc0, { roughness: 0.58 });
  for (const location of [0.2, 0.34, 0.49, 0.65, 0.8]) {
    const point = axonCurve.getPointAt(location);
    const swelling = sphere(1, varicosityMat, point.toArray(), 18);
    swelling.scale.set(3.6, 5.6, 3.6);
    swelling.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axonCurve.getTangentAt(location).normalize());
    group.add(label(swelling, 'En passant serotonergic release site',
      'A schematic axonal varicosity: a swelling that can contain serotonin vesicles and release transmitter along an axon. Many serotonergic varicosities signal beyond a classical synaptic contact through volume transmission.'));
  }
  const bouton = sphere(7.1, material(COLORS.pre), [99, 17, 5], 22);
  bouton.scale.set(1.2, 0.82, 1);
  group.add(label(bouton, 'Terminal bouton — synapse detail', 'Select the synapse view to inspect serotonin release, receptor binding, and SERT inhibition.'));
  const contact = sphere(6.5, material(COLORS.post), [103, 4, 5], 20);
  group.add(label(contact, 'Receiving dendritic spine', 'A simplified synaptic contact between the terminal and a dendritic spine.'));
  group.add(taperedBranch([[106, 2, 5], [120, -5, 1], [137, -22, -6]], 2.2, 3.5, material(COLORS.post)));
  const targetAxon = tube([[169, -43, -12], [196, -72, -5], [215, -104, 5], [256, -114, -1]], 1.8, material(COLORS.post), 44, 9);
  group.add(label(targetAxon, 'Receiving neuron axon', 'This neuron can propagate its own electrical output as a result of integrated inputs.'));
  group.userData.sourceSoma = [-135, 30, -2];
  group.userData.targetSoma = [154, -32, -10];
  group.userData.synapsePosition = [101, 11, 5];
  return group;
}
