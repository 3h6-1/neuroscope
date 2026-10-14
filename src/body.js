import * as THREE from 'three';

// Anatomical context, not a patient scan or a spatial drug-distribution model.
// Circulation and the magnified blood–brain barrier are separate display scales.
const UP = new THREE.Vector3(0, 1, 0);
const palette = { tissue: 0x638e94, artery: 0xd88783, vein: 0x6e9fc7, brain: 0xb7a6d4, glia: 0x83c5b3, endothelium: 0x7bb6b5, pericyte: 0xd0ac83 };
const sphereGeometry = new THREE.SphereGeometry(1, 18, 12);
function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.54, metalness: 0.09, ...extra }); }
function labeled(object, name, description, type = 'anatomy') {
  object.name = name;
  object.userData = { ...object.userData, label: name, description, type };
  return object;
}
function ball(position, scale, material) {
  const object = new THREE.Mesh(sphereGeometry, material);
  object.position.set(...position);
  object.scale.set(...(Array.isArray(scale) ? scale : [scale, scale, scale]));
  return object;
}
function curveTube(points, radius, material, segments = 40, radial = 7, closed = false) {
  const curve = points instanceof THREE.CatmullRomCurve3 ? points : new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radial, closed), material);
}
function lineBetween(a, b, radius, material) {
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  return mesh;
}
function random(index, seed = 1) { const n = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453; return n - Math.floor(n); }

function createBrain() {
  const group = labeled(new THREE.Group(), 'Brain', 'Schematic cerebral hemispheres, cortical folds, cerebellum and brainstem. Geometry is not a reconstructed human brain.');
  group.position.set(0, 72, 0);
  const tissue = mat(palette.brain, { transparent: true, opacity: 0.32, depthWrite: false });
  const folds = mat(0xb5afd5, { roughness: 0.7 });
  for (const side of [-1, 1]) {
    group.add(ball([side * 7.5, 2, 0], [9, 13, 12], tissue));
    for (let ridge = 0; ridge < 9; ridge++) {
      const points = [];
      const longitude = -Math.PI * 0.74 + ridge * Math.PI * 1.48 / 8;
      for (let step = 0; step <= 24; step++) {
        const latitude = -1.13 + step / 24 * 2.31;
        const angle = longitude + Math.sin(latitude * 5 + ridge * 1.7) * 0.14;
        points.push([side * (7.5 + 8.65 * Math.cos(latitude) * Math.cos(angle)), 2 + 12.5 * Math.sin(latitude), 11.65 * Math.cos(latitude) * Math.sin(angle)]);
      }
      group.add(labeled(curveTube(points, 0.85, folds, 42, 6), 'Cortical fold', 'Stylized gyri indicate the folded cerebral surface; no cortical region or sulcus is anatomically registered.'));
    }
  }
  const cerebellum = labeled(ball([0, -10.5, -6], [11, 5.4, 7.7], mat(0x9299bf)), 'Cerebellum', 'The cerebellum is shown below and behind the cerebral hemispheres, in schematic anatomy.');
  group.add(cerebellum);
  for (let fold = 0; fold < 6; fold++) {
    const y = -13.5 + fold * 1.15;
    group.add(curveTube([[-9, y, -4], [-5, y + 0.7, 0], [0, y + 0.9, 1.2], [5, y + 0.7, 0], [9, y, -4]], 0.28, folds, 20, 5));
  }
  group.add(labeled(curveTube([[0, -6, -4], [0, -17, -4], [0, -23, -3]], 2.5, mat(0x8da5b1), 22, 9), 'Brainstem', 'Schematic brainstem connecting the brain with the spinal cord.'));
  const arterial = mat(palette.artery, { emissive: 0x4f2021, emissiveIntensity: 0.15 });
  for (const side of [-1, 1]) {
    group.add(curveTube([[side * 3, -20, 3], [side * 5, -10, 8], [side * 10, -4, 11], [side * 14, 5, 8], [side * 12, 11, 4]], 0.48, arterial, 30));
    for (let branch = 0; branch < 3; branch++) {
      const y = -5 + branch * 6;
      group.add(curveTube([[side * 10, y, 10], [side * 5, y + 3, 11], [side * 2, y + 6, 8]], 0.27, arterial, 17, 5));
    }
  }
  return group;
}

function capillaryPatch(x0, x1, angle0, angle1, radius, material) {
  const geometry = new THREE.BufferGeometry();
  const positions = [], normals = [], indices = [];
  const axial = 3, radial = 12;
  for (let i = 0; i <= axial; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / axial);
    for (let j = 0; j <= radial; j++) {
      const angle = THREE.MathUtils.lerp(angle0, angle1, j / radial);
      positions.push(x, radius * Math.cos(angle), radius * Math.sin(angle));
      normals.push(0, Math.cos(angle), Math.sin(angle));
      if (i < axial && j < radial) {
        const p = i * (radial + 1) + j;
        indices.push(p, p + radial + 1, p + 1, p + 1, p + radial + 1, p + radial + 2);
      }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry, material);
}

function createErythrocyte() {
  // Smooth biconcave display shape. This is a cell silhouette, not a mechanics model.
  const profile = [];
  const radius = 6;
  for (let i = 0; i <= 16; i++) {
    const r = i / 16;
    profile.push(new THREE.Vector2(radius * r, Math.sqrt(Math.max(0, 1 - r * r)) * (0.5 + 3.6 * r * r - 2.2 * r ** 4)));
  }
  for (let i = 15; i >= 0; i--) {
    const r = i / 16;
    profile.push(new THREE.Vector2(radius * r, -Math.sqrt(Math.max(0, 1 - r * r)) * (0.5 + 3.6 * r * r - 2.2 * r ** 4)));
  }
  return new THREE.Mesh(new THREE.LatheGeometry(profile, 22), mat(0xb76068, { roughness: 0.42 }));
}

function createBarrier() {
  const group = labeled(new THREE.Group(), 'Blood–brain barrier · magnified capillary',
    'Separate magnified scale. Endothelial tight junctions, basement membrane, pericyte and astrocyte endfeet form the illustrated neurovascular unit. Shapes and cell dimensions are schematic; this is not a drug permeability calculation.', 'barrier');
  const endothelialCells = [], tightJunctions = [], astrocytes = [], pericytes = [], bloodCells = [];
  const lumen = labeled(capillaryPatch(-85, 85, Math.PI, Math.PI * 2, 15.8, mat(0x51343f, { transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })),
    'Capillary blood lumen', 'The capillary lumen carries plasma and blood cells. Free drug in plasma can interact with the endothelial barrier; circulating erythrocytes are shown for context.');
  group.add(lumen);
  const cellMats = [0x72aaa9, 0x6fa2ab, 0x78b3ae].map(color => mat(color, { transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  for (let lengthIndex = 0; lengthIndex < 6; lengthIndex++) {
    for (let arcIndex = 0; arcIndex < 3; arcIndex++) {
      const x0 = -84 + lengthIndex * 28, x1 = x0 + 27.4;
      const a0 = Math.PI + arcIndex * Math.PI / 3 + 0.012, a1 = Math.PI + (arcIndex + 1) * Math.PI / 3 - 0.012;
      const cell = labeled(capillaryPatch(x0, x1, a0, a1, 17, cellMats[(arcIndex + lengthIndex) % 3]),
        'Brain capillary endothelial cell', 'A continuous endothelial cell layer encloses the capillary. The open front is a cutaway for viewing; it does not represent an anatomical gap.');
      endothelialCells.push(cell); group.add(cell);
      const angle = (a0 + a1) / 2;
      const nucleus = ball([(x0 + x1) / 2, Math.cos(angle) * 17.4, Math.sin(angle) * 17.4], [3.6, 1.5, 2.1], mat(0x698498));
      labeled(nucleus, 'Endothelial nucleus', 'Schematic cell nucleus on the capillary wall.');
      group.add(nucleus);
    }
  }
  const junctionMat = mat(0xc2ddaa, { emissive: 0x577451, emissiveIntensity: 0.12 });
  for (let index = 1; index < 6; index++) {
    const points = [];
    for (let j = 0; j <= 24; j++) {
      const angle = Math.PI + j * Math.PI / 24;
      points.push([-84 + index * 28 - 0.3, Math.cos(angle) * 17.2, Math.sin(angle) * 17.2]);
    }
    const junction = labeled(curveTube(points, 0.37, junctionMat, 28, 5), 'Endothelial tight junction',
      'Tight junctions restrict movement between endothelial cells. Transcellular permeability also depends on drug properties and transporters.');
    tightJunctions.push(junction); group.add(junction);
  }
  for (const angle of [Math.PI * 4 / 3, Math.PI * 5 / 3]) {
    const junction = labeled(curveTube([[-84, Math.cos(angle) * 17.2, Math.sin(angle) * 17.2], [0, Math.cos(angle) * 17.2, Math.sin(angle) * 17.2], [84, Math.cos(angle) * 17.2, Math.sin(angle) * 17.2]], 0.37, junctionMat, 12, 5), 'Endothelial tight junction', 'Schematic sealing junction along adjacent endothelial-cell boundaries.');
    tightJunctions.push(junction); group.add(junction);
  }
  group.add(labeled(capillaryPatch(-86, 86, Math.PI, Math.PI * 2, 19.7, mat(0xaabda9, { transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })), 'Basement membrane', 'An extracellular matrix layer surrounds the endothelial tube and supports the neurovascular unit.'));
  const gliaMat = mat(palette.glia, { roughness: 0.66 });
  for (const [i, origin] of [[0, [-42, 55, -9]], [1, [45, -54, -6]]]) {
    const astrocyte = labeled(new THREE.Group(), 'Astrocyte and vascular endfeet', 'Astrocytes send processes to vessels. Their endfeet help support barrier function and neurovascular signaling; they are outside the endothelial layer.');
    astrocyte.add(ball(origin, [5.1, 5.9, 4.6], gliaMat));
    astrocyte.add(ball([origin[0] + 0.4, origin[1], origin[2] + 3], 2.6, mat(0x5c8e8d)));
    for (let branch = 0; branch < 6; branch++) {
      const target = [origin[0] + (branch - 2.5) * 10.3, i ? -21 : 21, -5 - (branch % 3) * 4];
      const middle = [(origin[0] + target[0]) / 2, origin[1] * 0.67, -13 + (branch % 2) * 9];
      astrocyte.add(curveTube([origin, middle, target], 0.72, gliaMat, 20, 6));
      astrocyte.add(labeled(ball(target, [4.4, 1.1, 3.4], gliaMat), 'Astrocyte endfoot', 'An astrocytic process contacts the vessel exterior; the tight endothelial layer forms the immediate barrier.'));
      const peripheral = [origin[0] + (branch - 2.5) * 6, origin[1] + (i ? -1 : 1) * (13 + (branch % 2) * 9), origin[2] - 8 + branch * 2];
      astrocyte.add(curveTube([origin, [peripheral[0], origin[1] + (i ? -8 : 8), -9], peripheral], 0.4, gliaMat, 14, 5));
    }
    astrocytes.push(astrocyte); group.add(astrocyte);
  }
  const pericyte = labeled(new THREE.Group(), 'Pericyte', 'A mural cell extends processes along the capillary exterior and contributes to vessel stability and barrier regulation.');
  const pericyteMat = mat(palette.pericyte, { roughness: 0.68 });
  pericyte.add(ball([15, 0, -22], [8.2, 4, 2.7], pericyteMat));
  for (const direction of [-1, 1]) {
    pericyte.add(curveTube([[15, 0, -22], [15 + direction * 17, 4, -22], [15 + direction * 29, 9, -19], [15 + direction * 39, 13, -15]], 0.85, pericyteMat, 26, 6));
  }
  pericytes.push(pericyte); group.add(pericyte);
  for (let i = 0; i < 8; i++) {
    const cell = createErythrocyte();
    cell.position.set(-72 + i * 20, Math.sin(i * 2) * 5, Math.cos(i * 1.7) * 3);
    cell.rotation.set(0.4 + i * 0.12, i * 0.55, 0.7);
    labeled(cell, 'Erythrocyte', 'A schematic biconcave red blood cell. Blood-cell motion is illustrative and does not determine modeled drug concentration.');
    bloodCells.push(cell); group.add(cell);
  }
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(-90, 0, 4), new THREE.Vector3(-30, 2, 4), new THREE.Vector3(30, -2, 4), new THREE.Vector3(90, 0, 4)]);
  group.userData.displayScale = 'magnified capillary; arbitrary display units';
  return { group, endothelialCells, tightJunctions, astrocytes, pericytes, bloodCells, bloodPath: path };
}

export function createBodySystem() {
  const group = labeled(new THREE.Group(), 'Bloodstream to brain', 'Illustrative systemic circulation and a separate magnified blood–brain barrier view. Drug amounts and fluxes are supplied by the pharmacokinetic model.', 'body-system');
  const circulation = labeled(new THREE.Group(), 'Systemic circulation', 'Stylized torso, brain, heart, liver and kidneys provide physiological context. Vessel paths are explanatory, not an anatomical vascular reconstruction.', 'circulation');
  const shellMat = mat(palette.tissue, { transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
  const torso = ball([0, -10, -5], [38, 58, 18], shellMat);
  torso.name = 'Torso cutaway'; circulation.add(torso);
  circulation.add(ball([0, 70, -1], [21, 24, 17], shellMat));
  circulation.add(curveTube([[0, 41, -2], [0, 53, -2]], 7, shellMat, 12, 16));
  const shoulderMat = mat(0x81a4a6, { transparent: true, opacity: 0.21, depthWrite: false });
  for (const side of [-1, 1]) {
    circulation.add(curveTube([[0, 35, 4], [side * 24, 31, 3], [side * 39, 22, -1], [side * 44, -3, -3], [side * 42, -31, -4]], 2.3, shoulderMat, 35, 8));
    for (let rib = 0; rib < 5; rib++) {
      const y = 22 - rib * 9;
      circulation.add(curveTube([[side * 1, y, 12], [side * 15, y + 2, 14], [side * 30, y + 1, 7], [side * 30, y, -6]], 0.42, shoulderMat, 24, 5));
    }
  }
  const brain = createBrain(); circulation.add(brain);
  const spinalCord=labeled(curveTube([[0,49,-3],[0,35,-10],[0,7,-13],[0,-29,-10]],1.8,mat(0xd1c398),48,10),
    'Spinal cord · central nervous system','The spinal cord continues from the medulla inside the vertebral canal and ends above the lower spinal nerve roots. This torso-scale course is schematic; peripheral nerves, vertebrae and segmental reflex physiology are not reconstructed.','cns-anatomy');
  spinalCord.userData.anatomyId='spinal-cord';circulation.add(spinalCord);
  const thyroid=labeled(new THREE.Group(),'Thyroid gland · endocrine organ','The thyroid produces T4 and T3 under pituitary TSH control. This gland is outside the CNS; hormone production and concentrations are not numerically simulated.','endocrine-organ');
  for(const side of [-1,1])thyroid.add(ball([side*3.7,44,7],[2.9,4.8,2.2],mat(0xd6a28c)));
  thyroid.add(ball([0,43,7],[2,1.2,1.3],mat(0xd6a28c)));circulation.add(thyroid);
  const heart = labeled(new THREE.Group(), 'Heart', 'The heart drives circulation through pulmonary and systemic vascular circuits. The displayed circulation loop is schematic; it is not a haemodynamic simulation.');
  heart.position.set(-9, 9, 6); heart.rotation.z = -0.25;
  const heartMat = mat(0xc5787d, { roughness: 0.68 });
  heart.add(ball([-3, 2, 0], [5, 7, 4.3], heartMat), ball([3, 1, 0], [4.4, 6.8, 4.1], heartMat), ball([0, -3.5, 0], [4.5, 5, 4], heartMat));
  circulation.add(heart);
  const liver = labeled(ball([12, -12, 5], [19, 9, 7.5], mat(0xa87f73, { roughness: 0.8 })), 'Liver', 'Hepatic metabolism contributes to drug clearance. The pharmacokinetic model determines metabolism; organ appearance does not encode enzyme activity.');
  liver.rotation.z = -0.15; circulation.add(liver);
  const kidneys = [];
  for (const side of [-1, 1]) {
    const kidney = labeled(ball([side * 20, -31, -2], [5.2, 8, 4], mat(0xa57b83)), side < 0 ? 'Right kidney (schematic)' : 'Left kidney (schematic)', 'The kidneys filter blood and contribute to elimination of drugs and metabolites. Renal contribution is model dependent.');
    kidney.rotation.z = side * -0.25; kidneys.push(kidney); circulation.add(kidney);
  }
  const lungs = [];
  const adrenalGlands=[];
  for(const side of [-1,1]) {
    const gland=labeled(ball([side*20,-22,-2],[4.5,2.4,3],mat(0xd5bd7c)), 'Adrenal gland · endocrine organ', 'Adrenal glands lie above the kidneys. Their cortex releases cortisol under ACTH control; their medulla releases catecholamines under sympathetic control. These distinct pathways are anatomical context, not a simulated hormone level.', 'endocrine-organ');
    adrenalGlands.push(gland);circulation.add(gland);
  }
  for (const side of [-1, 1]) {
    const lung = labeled(ball([side * 19, 10, -5], [11, 21, 8], mat(0x769ba2, { transparent: true, opacity: 0.16, depthWrite: false })), 'Lung', 'Lungs and pulmonary circulation are shown for torso context. Gas exchange is not modeled.');
    lungs.push(lung); circulation.add(lung);
  }
  const arteryMat = mat(palette.artery, { emissive: 0x3a141d, emissiveIntensity: 0.13 });
  const veinMat = mat(palette.vein, { emissive: 0x182c40, emissiveIntensity: 0.15 });
  const vessels = new THREE.Group();
  labeled(vessels, 'Schematic arterial and venous circulation', 'Red and blue distinguish arterial and venous pathways in this illustration. Drug circulation is governed by compartmental pharmacokinetics, not the decorative vessel geometry.');
  const arterial = [[-9, 14, 8], [-5, 29, 6], [4, 27, 7], [6, 8, 10], [5, -18, 9], [4, -48, 6]];
  vessels.add(curveTube(arterial, 1.25, arteryMat, 60, 9));
  vessels.add(curveTube([[-2, -51, 3], [-5, -28, 6], [-7, -4, 8], [-13, 14, 7]], 1.18, veinMat, 48, 9));
  for (const side of [-1, 1]) {
    vessels.add(curveTube([[0, 28, 7], [side * 6, 42, 7], [side * 6, 57, 6], [side * 7, 69, 8]], 0.8, arteryMat, 35));
    vessels.add(curveTube([[side * 13, 71, -3], [side * 11, 52, 1], [side * 10, 34, 4], [-12, 16, 6]], 0.68, veinMat, 38));
    vessels.add(curveTube([[5, -23, 9], [side * 11, -26, 7], [side * 19, -29, 2]], 0.7, arteryMat, 18));
    vessels.add(curveTube([[side * 21, -33, 1], [side * 10, -35, 2], [-5, -28, 6]], 0.65, veinMat, 18));
  }
  vessels.add(curveTube([[5, -11, 10], [17, -13, 12], [27, -11, 8]], 0.7, arteryMat, 18));
  vessels.add(curveTube([[24, -16, 5], [8, -21, 6], [-5, -18, 6]], 0.6, veinMat, 18));
  circulation.add(vessels);
  const bloodPath = new THREE.CatmullRomCurve3([
    [-9, 9, 9], [-4, 30, 7], [6, 51, 7], [9, 76, 8], [-10, 80, -2], [-11, 45, 3], [-9, 12, 8],
    [6, -9, 10], [21, -14, 11], [18, -29, 3], [4, -49, 6], [-18, -34, 1], [-7, -16, 7],
  ].map(point => new THREE.Vector3(...point)), true, 'centripetal');
  circulation.userData.displayScale = 'schematic human torso; arbitrary display units';
  const barrierParts = createBarrier();
  const barrier = barrierParts.group;
  barrier.visible = false;
  group.add(circulation, barrier);
  return {
    group, circulation, barrier, bloodPath, barrierBloodPath: barrierParts.bloodPath,
    brainPosition: new THREE.Vector3(0, 72, 0), organs: { brain, spinalCord, thyroid, adrenalGlands, heart, liver, kidneys, lungs }, vessels,
    endothelialCells: barrierParts.endothelialCells, tightJunctions: barrierParts.tightJunctions,
    astrocytes: barrierParts.astrocytes, pericytes: barrierParts.pericytes, bloodCells: barrierParts.bloodCells,
  };
}

function fallbackNeurons(count) {
  return Array.from({ length: count }, (_, id) => {
    const column = id % 4, layer = Math.floor(id / 4);
    return { id, type: id < Math.round(count * 0.8) ? 'E' : 'I', x: (column - 1.5) * 36 + (random(id, 3) - 0.5) * 12, y: 66 - layer * 132 / Math.max(1, Math.ceil(count / 4) - 1), z: (random(id, 8) - 0.5) * 70 };
  });
}

export function createCorticalNetwork(count = 48, { neurons, connections } = {}) {
  const sourceNeurons = neurons ?? fallbackNeurons(count);
  const size = sourceNeurons.length;
  const ids = new Set(sourceNeurons.map(neuron => neuron.id));
  if (ids.size !== size || sourceNeurons.some(neuron => !Number.isInteger(neuron.id) || neuron.id < 0 || neuron.id >= size)) throw new RangeError('Cortical neuron IDs must be unique contiguous integers from zero.');
  const sourceConnections = connections ?? sourceNeurons.flatMap(neuron => {
    return sourceNeurons.filter(target => target.id !== neuron.id && random(neuron.id * size + target.id, 21) < 0.075)
      .map(target => ({ from: neuron.id, to: target.id, weight: neuron.type === 'I' ? -1 : 1 }));
  });
  const group = labeled(new THREE.Group(), 'Cortical circuit', 'Illustrative excitatory and inhibitory neural circuit. Activity and connection topology are supplied by the neural simulation; cell shapes and layout are schematic.', 'cortical-network');
  const nodes = [], edges = [];
  const rawPositions = sourceNeurons.map(neuron => new THREE.Vector3(neuron.x, neuron.y, neuron.z));
  if (rawPositions.some(point => !point.toArray().every(Number.isFinite))) throw new TypeError('Neuron positions must contain finite x, y and z.');
  const bounds = new THREE.Box3().setFromPoints(rawPositions);
  const center = size ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const extent = size ? bounds.getSize(new THREE.Vector3()) : new THREE.Vector3();
  const fitScale = size > 1 ? 140 / Math.max(extent.x, extent.y, extent.z, 1e-9) : 1;
  const excitatory = 0x7fcbbb, inhibitory = 0xbf98d6;
  const branchMaterials = new Map(['E', 'I'].map(type => [type, mat(type === 'I' ? 0x8c71a6 : 0x5a938b, { transparent: true, opacity: 0.58, depthWrite: false })]));
  for (let index = 0; index < size; index++) {
    const neuron = sourceNeurons[index];
    const type = neuron.type;
    const inhibitoryCell = type === 'I';
    const radius = inhibitoryCell ? 2.7 : 2.4;
    const material = mat(inhibitoryCell ? inhibitory : excitatory, { emissive: inhibitoryCell ? inhibitory : excitatory, emissiveIntensity: 0.07, roughness: 0.38 });
    const mesh = new THREE.Mesh(inhibitoryCell ? new THREE.SphereGeometry(radius, 14, 10) : new THREE.ConeGeometry(radius * 1.13, radius * 2, 5), material);
    mesh.position.copy(rawPositions[index]).sub(center).multiplyScalar(fitScale);
    labeled(mesh, `${inhibitoryCell ? 'Inhibitory interneuron' : 'Excitatory neuron'} ${neuron.id + 1}`,
      'A schematic neuron whose activity color is driven by the computational neural model. Shape distinguishes broad cell classes and does not identify a biological subtype.', type);
    mesh.userData = { ...mesh.userData, id: neuron.id, neuronId: neuron.id, originalPosition: rawPositions[index].toArray(), baseColor: inhibitoryCell ? inhibitory : excitatory };
    nodes[neuron.id] = mesh;
    const branchMat = branchMaterials.get(inhibitoryCell ? 'I' : 'E');
    for (let branch = 0; branch < (inhibitoryCell ? 5 : 4); branch++) {
      const angle = branch * Math.PI * 2 / (inhibitoryCell ? 5 : 4) + neuron.id * 0.83;
      const endpoint = [Math.cos(angle) * 8, Math.sin(angle) * 8 + (branch === 0 && !inhibitoryCell ? 5 : 0), Math.sin(angle * 2 + neuron.id) * 4];
      const middle = endpoint.map(value => value * 0.58);
      mesh.add(curveTube([[0, 0, 0], middle, endpoint], 0.24, branchMat, 10, 5));
      mesh.add(curveTube([middle, [endpoint[0] + Math.sin(angle) * 2.4, endpoint[1] - Math.cos(angle) * 2.4, endpoint[2] - 2]], 0.16, branchMat, 7, 4));
    }
    group.add(mesh);
  }
  const edgeMaterials = {
    E: mat(0x4f948b, { transparent: true, opacity: 0.17, depthWrite: false }),
    I: mat(0x9d80b8, { transparent: true, opacity: 0.22, depthWrite: false }),
  };
  const edgeGroup = labeled(new THREE.Group(), 'Modeled synaptic connections', 'Each displayed edge corresponds to a connection in the neural model. Curved axons show topology, not reconstructed axon trajectories.', 'connections');
  for (const connection of sourceConnections) {
    const from = nodes[connection.from], to = nodes[connection.to];
    if (!from || !to) throw new RangeError(`Connection references missing neuron ${connection.from} or ${connection.to}.`);
    const inhibitoryEdge = from.userData.type === 'I';
    const mid = from.position.clone().lerp(to.position, 0.5);
    mid.z -= 7 + random(connection.from * size + connection.to, 38) * 11;
    const curve = new THREE.CatmullRomCurve3([from.position.clone(), mid, to.position.clone()]);
    const edge = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, inhibitoryEdge ? 0.16 : 0.12, 4), edgeMaterials[inhibitoryEdge ? 'I' : 'E']);
    labeled(edge, `${inhibitoryEdge ? 'Inhibitory' : 'Excitatory'} connection ${connection.from + 1} → ${connection.to + 1}`,
      'One directed connection from the supplied neural simulation; visual strength does not independently determine the modeled synaptic weight.', 'connection');
    edge.userData = { ...edge.userData, from: connection.from, to: connection.to, weight: connection.weight, sourceType: from.userData.type, curve };
    edges.push(edge); edgeGroup.add(edge);
  }
  group.add(edgeGroup);
  group.userData.displayScale = 'schematic cortical circuit; arbitrary display units';
  group.userData.positionTransform = { center: center.toArray(), scale: fitScale };
  return { group, nodes, edges, edgeGroup, connections: sourceConnections, neurons: sourceNeurons };
}
