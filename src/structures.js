import * as THREE from 'three';

const ELEMENTS = {
  C: { color: 0x8cabb1, radius: 0.36, name: 'Carbon' },
  N: { color: 0x699dff, radius: 0.34, name: 'Nitrogen' },
  O: { color: 0xfa7d79, radius: 0.33, name: 'Oxygen' },
  F: { color: 0xa3e5bd, radius: 0.32, name: 'Fluorine' },
  H: { color: 0xf0f4f2, radius: 0.21, name: 'Hydrogen' },
  CO: { color: 0xdc96c5, radius: 0.48, name: 'Cobalt' },
  S: { color: 0xe9cc81, radius: 0.43, name: 'Sulfur' },
  P: { color: 0xe9a581, radius: 0.43, name: 'Phosphorus' },
  NA: { color: 0xbfc4ff, radius: 0.9, name: 'Sodium' },
  CL: { color: 0xa3e5bd, radius: 0.8, name: 'Chlorine' },
};
const ATOM_GEOMETRY = new THREE.SphereGeometry(1, 20, 14);
const BOND_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 12);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const atomMaterials = new Map();

function elementInfo(element) {
  return ELEMENTS[element.toUpperCase()] ?? { color: 0xdbb6db, radius: 0.38, name: element };
}

function elementMaterial(element) {
  const key = element.toUpperCase();
  if (!atomMaterials.has(key)) {
    atomMaterials.set(key, new THREE.MeshStandardMaterial({
      color: elementInfo(key).color, roughness: 0.29, metalness: 0.1,
    }));
  }
  return atomMaterials.get(key);
}

function position(atom, center = [0, 0, 0]) {
  return new THREE.Vector3(atom.x - center[0], atom.y - center[1], atom.z - center[2]);
}

function segment(a, b, radius, mat) {
  const length = a.distanceTo(b);
  if (length < 1e-10) return null;
  const mesh = new THREE.Mesh(BOND_GEOMETRY, mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3().subVectors(b, a).normalize());
  mesh.scale.set(radius, length, radius);
  return mesh;
}

function bondOffset(a, b, atoms, bonds) {
  const origin = position(a);
  const axis = position(b).sub(origin).normalize();
  // Use the local molecular plane when possible; multiple-bond strokes then
  // lie in the aromatic/functional-group plane, not in a camera-facing plane.
  for (const edge of bonds) {
    const neighborId = edge.a === a.id ? edge.b : edge.b === a.id ? edge.a : undefined;
    if (neighborId === undefined || neighborId === b.id) continue;
    const neighbor = atoms.get(neighborId);
    if (!neighbor) continue;
    const perpendicular = position(neighbor).sub(origin);
    perpendicular.addScaledVector(axis, -perpendicular.dot(axis));
    if (perpendicular.lengthSq() > 0.03) return perpendicular.normalize();
  }
  const reference = Math.abs(axis.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(axis, reference).normalize();
}

/** Render only the supplied conformer; do not embed, minimize or alter chirality. */
export function buildMolecule(data, { scale = 1, hydrogens = true } = {}) {
  if (!data || !Array.isArray(data.atoms) || !Array.isArray(data.bonds)) throw new TypeError('Molecule data requires atoms and bonds arrays.');
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Molecule display scale must be positive.');
  const group = new THREE.Group();
  group.name = data.name ?? data.resName ?? 'Molecule';
  group.scale.setScalar(scale);
  group.userData = {
    label: group.name, type: 'molecule', formula: data.formula,
    description: data.note ?? (Array.isArray(data.notes) ? data.notes.join(' ') : data.notes) ?? (data.dimension === 2 ? 'Two-dimensional connectivity diagram; no physical three-dimensional conformation is supplied.' : 'Ball-and-stick representation of the supplied three-dimensional coordinates. Atomic radii are display radii, not a solvent-accessible surface.'),
    units: data.units ?? (data.dimension === 2 ? '2D diagram units' : 'angstrom'), cid: data.cid, charge: data.charge,
    atomCount: data.atoms.length, bondCount: data.bonds.length,
    stereochemistry: data.stereochemistry, provenance: data.provenance,
  };
  const atoms = new Map();
  const centers = new Map((data.stereochemistry?.centers ?? []).map(center => [center.atomId, center]));
  for (const atom of data.atoms) {
    if (atoms.has(atom.id)) throw new Error(`Duplicate atom id ${atom.id}.`);
    if (![atom.x, atom.y, atom.z].every(Number.isFinite)) throw new Error(`Nonfinite coordinates at atom ${atom.id}.`);
    atoms.set(atom.id, atom);
    const info = elementInfo(atom.element);
    const chirality = centers.get(atom.id);
    const ball = new THREE.Mesh(ATOM_GEOMETRY, elementMaterial(atom.element));
    ball.position.copy(position(atom));
    ball.scale.setScalar(info.radius);
    ball.visible = hydrogens || atom.element.toUpperCase() !== 'H';
    const chargeText = atom.charge ? ` Formal charge ${atom.charge > 0 ? '+' : ''}${atom.charge}.` : '';
    const chiralityText = chirality ? ` ${chirality.configuration} stereocenter; supplied coordinates preserve the verified absolute configuration.` : '';
    ball.userData = {
      label: `${info.name}${atom.name ? ` ${atom.name}` : ` · atom ${atom.id + 1}`}${chirality ? ` · ${chirality.configuration} stereocenter` : ''}`,
      description: `${group.name}. ${info.name} atom in the supplied ${data.dimension === 2 ? 'two-dimensional connectivity diagram; no physical 3D conformation is available' : data.resName ? 'experimental heavy-atom pose' : 'three-dimensional conformer'}.${chargeText}${chiralityText}`,
      type: 'atom', element: atom.element, atomId: atom.id,
      hydrogen: atom.element.toUpperCase() === 'H', charge: atom.charge ?? null,
      configuration: chirality?.configuration,
    };
    ball.name = ball.userData.label;
    group.add(ball);
  }

  for (const bond of data.bonds) {
    const a = atoms.get(bond.a);
    const b = atoms.get(bond.b);
    if (!a || !b) throw new Error(`Bond references missing atom ${bond.a} or ${bond.b}.`);
    const start = position(a), end = position(b);
    const hydrogen = a.element.toUpperCase() === 'H' || b.element.toUpperCase() === 'H';
    const order = Number(bond.order ?? 1);
    const bondName = ({ 1: 'Single bond', 1.5: 'Aromatic bond', 2: 'Double bond', 3: 'Triple bond', 4: 'Quadruple bond', 5: 'Dative bond', 6: 'Complex bond', 7: 'Ionic association', 255: 'Unspecified connection' })[order];
    if (!bondName) throw new Error(`Unsupported bond type ${order}.`);
    const specialConnection = [5, 6, 7, 255].includes(order);
    const offset = bondOffset(a, b, atoms, data.bonds);
    const offsets = order === 4 ? [-0.3, -0.1, 0.1, 0.3] : order === 3 ? [-0.21, 0, 0.21] : order === 2 || order === 1.5 ? [-0.115, 0.115] : [0];
    const radius = hydrogen ? 0.055 : specialConnection || order >= 2 ? 0.067 : 0.092;
    const bondGroup = new THREE.Group();
    bondGroup.name = bondName;
    bondGroup.visible = hydrogens || !hydrogen;
    bondGroup.userData = {
      label: `${a.element}–${b.element} ${bondGroup.name.toLowerCase()}`,
      description: specialConnection ? `${bondName} from source connectivity code ${order}. The dashed connector marks an association, not a numerical covalent bond order or a computed coordination geometry.` : `Connectivity and bond order ${order} from the supplied molecular data. Cylinders are a ball-and-stick drawing convention.`,
      type: 'bond', a: a.id, b: b.id, order, hydrogen,
    };
    const drawStroke = (from, to, lo = 0, hi = 1) => {
      const midpoint = from.clone().lerp(to, (0.5 - lo) / (hi - lo));
      const coloredParts = hi <= 0.5 ? [[from, to, a.element]]
        : lo >= 0.5 ? [[from, to, b.element]]
          : [[from, midpoint, a.element], [midpoint, to, b.element]];
      for (const [p, q, element] of coloredParts) {
        const half = segment(p, q, radius, elementMaterial(element));
        if (!half) continue;
        half.userData = { ...bondGroup.userData };
        half.visible = hydrogens || !hydrogen;
        bondGroup.add(half);
      }
    };
    offsets.forEach((distance, index) => {
      const from = start.clone().addScaledVector(offset, distance);
      const to = end.clone().addScaledVector(offset, distance);
      if (specialConnection || (order === 1.5 && index === 1)) {
        // Delocalized bond depiction: solid plus dashed, without changing coordinates.
        for (let dash = 0; dash < 4; dash++) {
          const lo = (dash + 0.12) / 4;
          const hi = (dash + 0.7) / 4;
          drawStroke(from.clone().lerp(to, lo), from.clone().lerp(to, hi), lo, hi);
        }
      } else drawStroke(from, to);
    });
    group.add(bondGroup);
  }
  return group;
}

function backboneTube(points, radius, mat) {
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 7), radius, 9, false), mat);
}

/** Static, centered experimental SERT backbone/ligand assembly; no invented transition. */
export function buildSert(data) {
  const group = new THREE.Group();
  group.name = `${data.name ?? 'SERT'} · ${data.pdbId ?? 'experimental structure'}`;
  group.userData = {
    label: group.name, type: 'protein', pdbId: data.pdbId,
    description: `Experimental Cα backbone and bound ligands, chain ${data.chain ?? 'A'}, resolution ${data.resolutionAngstrom} Å. Static ligand-stabilized structure; not a molecular-dynamics trajectory.`,
    units: data.units ?? 'angstrom', sourceCenter: data.center,
    provenance: data.provenance, limitations: data.limitations,
  };
  const center = data.center ?? [0, 0, 0];
  const residues = data.residues ?? [];
  const segments = data.segments ?? [residues.map((_, index) => index)];
  const trace = new THREE.Group();
  trace.name = 'Resolved Cα backbone';
  trace.userData = {
    label: trace.name, type: 'protein-backbone',
    description: 'A smooth trace through deposited alpha-carbon coordinates. The tube is a drawing convention, not the protein molecular surface; unresolved gaps are left open.',
  };
  const loopMat = new THREE.MeshStandardMaterial({ color: 0x8da5b4, roughness: 0.58, metalness: 0.08, transparent: true, opacity: 0.68 });
  for (const indices of segments) {
    const points = indices.map(index => residues[index]).filter(Boolean).map(residue => position(residue, center));
    const mesh = backboneTube(points, 0.34, loopMat);
    if (mesh) {
      mesh.userData = { ...trace.userData };
      trace.add(mesh);
    }
  }
  group.add(trace);
  const colors = [0x9c8bd4, 0x8d9dd9, 0x7ab6cc, 0x63c8bb, 0x91cec0, 0xb5a2df];
  for (let helixIndex = 0; helixIndex < (data.helices ?? []).length; helixIndex++) {
    const helix = data.helices[helixIndex];
    const mat = new THREE.MeshStandardMaterial({ color: colors[helixIndex % colors.length], roughness: 0.4, metalness: 0.12 });
    const helixGroup = new THREE.Group();
    helixGroup.name = `Deposited helix ${helix.id}`;
    helixGroup.userData = {
      label: `${helixGroup.name} · residues ${helix.start}–${helix.end}`,
      description: 'Backbone trace through deposited Cα positions. HELIX records can divide a transmembrane helix into several pieces; each colored segment is not necessarily one transmembrane domain.',
      type: 'protein-helix', residueStart: helix.start, residueEnd: helix.end,
    };
    for (const indices of segments) {
      const points = indices.map(index => residues[index]).filter(residue => residue && residue.resSeq >= helix.start && residue.resSeq <= helix.end).map(residue => position(residue, center));
      const mesh = backboneTube(points, 0.76, mat);
      if (mesh) {
        mesh.userData = { ...helixGroup.userData };
        helixGroup.add(mesh);
      }
    }
    group.add(helixGroup);
  }

  const pocket = new THREE.Group();
  pocket.name = 'Resolved binding-pocket atoms';
  pocket.userData = {
    label: pocket.name, type: 'binding-pocket',
    description: 'Deposited heavy-atom positions of selected residues around the central binding pocket. Dots show actual coordinates; no pocket bonds or solvent surface have been inferred.',
  };
  const pocketMaterials = new Map();
  for (const atom of data.pocketAtoms ?? []) {
    if (!pocketMaterials.has(atom.element)) {
      pocketMaterials.set(atom.element, new THREE.MeshStandardMaterial({ color: elementInfo(atom.element).color, roughness: 0.6, transparent: true, opacity: 0.47, depthWrite: false }));
    }
    const mesh = new THREE.Mesh(ATOM_GEOMETRY, pocketMaterials.get(atom.element));
    mesh.position.copy(position(atom, center));
    mesh.scale.setScalar(atom.element.toUpperCase() === 'C' ? 0.27 : 0.32);
    mesh.userData = {
      label: `${atom.resName} ${atom.resSeq} · ${atom.name}`,
      description: `Resolved ${atom.element} atom in ${data.pdbId} chain ${data.chain}. B factor ${atom.bFactor} Å²; the deposited coordinates are preserved.`,
      type: 'atom', element: atom.element, atomId: atom.id, residueNumber: atom.resSeq,
    };
    pocket.add(mesh);
  }
  group.add(pocket);

  for (const ligand of data.ligands ?? []) {
    const sodium = ligand.resName?.toUpperCase() === 'NA';
    const ligandData = sodium ? { ...ligand, name: 'Bound sodium ion (Na⁺)', atoms: ligand.atoms.map(atom => ({ ...atom, charge: 1 })) } : ligand;
    const ligandGroup = buildMolecule(ligandData, { scale: 1, hydrogens: true });
    ligandGroup.position.set(-center[0], -center[1], -center[2]);
    ligandGroup.userData = {
      ...ligandGroup.userData, type: sodium ? 'ion' : 'bound-ligand',
      label: sodium ? `Bound sodium Na⁺ · site ${ligand.resSeq}` : ligand.name ?? `Bound ${ligand.resName}`,
      description: sodium
        ? `Experimentally resolved sodium ion ${ligand.resSeq}; original coordinate relative to the protein is preserved.`
        : `${ligand.name}. ${ligand.note ?? ''} Protein and ligand positions share the original deposited frame.`,
      residueNumber: ligand.resSeq,
    };
    // Highlight the actual ligand through its material only; geometry is untouched.
    ligandGroup.traverse(object => {
      if (!object.isMesh) return;
      object.material = object.material.clone();
      object.material.emissive.copy(object.material.color);
      object.material.emissiveIntensity = sodium ? 0.2 : 0.15;
      object.material.roughness = 0.24;
      object.userData.boundLigand = true;
    });
    group.add(ligandGroup);
  }
  return group;
}
