import * as THREE from 'three';
import {createInternalAnatomy} from './internal-anatomy.js';

// Surface vertices retain native fsaverage coordinates. Modeled region positions
// are approximate MNI-like annotations, not a registration or parcel assignment.
const COLORS = { executive:0x78c8c2, default:0xaaa0db, default_mode:0xaaa0db, salience:0xe8a184, limbic:0xd993a9, memory:0xabc992, language:0x9ec0df, reward:0xddbd77, thalamic:0x89abbc, cerebellar:0x9faec9, modulatory:0xe3cda0 };
const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const position = value => new THREE.Vector3(value[0], value[2], -value[1]);
const hash = text => [...String(text)].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7);
function tag(object, label, description, type, extra = {}) {
  object.name = label;
  object.userData = { label, description, type, ...extra };
  return object;
}
function material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness:0.61, metalness:0.06, ...extra }); }
function networkColor(network) {
  const key = String(network || '').toLowerCase().replace(/[ -]/g,'_');
  if (COLORS[key]) return COLORS[key];
  if (/default/.test(key)) return COLORS.default;
  if (/executive|frontoparietal|control/.test(key)) return COLORS.executive;
  if (/limbic|affect/.test(key)) return COLORS.limbic;
  if (/memory|hippocamp/.test(key)) return COLORS.memory;
  if (/salience|cingulo/.test(key)) return COLORS.salience;
  if (/modulat|brainstem/.test(key)) return COLORS.modulatory;
  return 0x8bbfb4;
}

function surfaceMesh(data, side, opacity) {
  if (!Array.isArray(data?.positions) || !Array.isArray(data?.indices) || data.positions.length % 3 || data.indices.length % 3) throw new TypeError(`Invalid ${side} surface arrays.`);
  if (!data.positions.every(Number.isFinite)) throw new TypeError(`Nonfinite ${side} surface coordinates.`);
  const count = data.positions.length / 3;
  if (data.indices.some(index => !Number.isInteger(index) || index < 0 || index >= count)) throw new RangeError(`Invalid ${side} surface triangle index.`);
  const points = new Float32Array(data.positions.length), colors = new Float32Array(data.positions.length);
  const base = new THREE.Color(0xaab7c0);
  for (let index = 0; index < count; index++) {
    points[index*3] = data.positions[index*3];
    points[index*3+1] = data.positions[index*3+2];
    points[index*3+2] = -data.positions[index*3+1];
    const depth = data.sulcalDepth?.[index] ?? 0;
    const shade = 0.73 - Math.tanh(depth * 0.8) * 0.2;
    colors[index*3] = base.r * shade;
    colors[index*3+1] = base.g * shade;
    colors[index*3+2] = base.b * shade;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(points,3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors,3));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material(0xffffff,{ vertexColors:true, transparent:true, opacity, depthWrite:false, side:THREE.DoubleSide }));
  mesh.renderOrder = 1;
  return tag(mesh, `${side === 'left' ? 'Left' : 'Right'} cerebral cortex · fsaverage5`,
    'MRI-derived FreeSurfer average pial surface distributed by Nilearn. Gray anatomy is contextual: primary sensory and motor regions are not functional nodes in this model. Region markers are approximate overlays, not registered atlas parcels.', 'brain-surface', { anatomyId:'cerebrum', hemisphere:side, source:'fsaverage5', units:'mm' });
}

function schematicSurface(side, opacity) {
  const geometry = new THREE.SphereGeometry(1,40,28);
  const p = geometry.getAttribute('position');
  for (let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const fold=1+0.035*Math.sin(y*19+z*5)*Math.cos(x*15-z*8);
    p.setXYZ(i,(side==='left'?-29:29)+x*36*fold,y*62*fold+13,z*83*fold+16);
  }
  geometry.computeVertexNormals();
  return tag(new THREE.Mesh(geometry,material(0x8c9aa5,{transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide})),
    `${side} cortex · schematic fallback`, 'Procedural placeholder used because a valid MRI-derived surface was not supplied. It is not reconstructed anatomy.', 'brain-surface', {anatomyId:'cerebrum',hemisphere:side,source:'procedural fallback'});
}

/**
 * @param {{regions:Array, connections:Array, surface?:Object}} options
 * Region position: approximate RAS/MNI-like [x lateral,y anterior,z superior].
 * Stats: {regional:[{id,e,i,baselineE,baselineI,delta}], ...}.
 */
export function createBrainAnatomy({regions=[],connections=[],surface}={}) {
  const group=tag(new THREE.Group(),'Association and modulatory brain network',
    'Selected non-sensory region populations inside anatomical context. This is a reduced network model, not an entire-brain simulation or a model of consciousness.','brain-network');
  const cortex=tag(new THREE.Group(),'Cortical surface reference','Gray cortical anatomy is reference context. No primary sensory or motor parcels are simulated.','cortex');
  const nodeMeshes=new Map(),edges=[];
  let opacity=0.28,cutaway=false,disposed=false,selected=null,activityVisible=true,connectionsVisible=true;
  const surfaceGroups = surface?.hemispheres;
  for(const side of ['left','right']) cortex.add(surfaceGroups?.[side]?surfaceMesh(surfaceGroups[side],side,opacity):schematicSurface(side,opacity));
  const internal=createInternalAnatomy();
  group.add(cortex,internal.group);
  group.userData.surfaceSource=surfaceGroups?'Nilearn fsaverage5 pial surfaces':'procedural fallback';
  group.userData.coordinateTransform='[x,y,z] -> [x,z,-y], no nonlinear registration';
  const sphere=new THREE.SphereGeometry(1,22,16);
  const ring=new THREE.TorusGeometry(1,0.025,5,42);
  for(const region of regions) {
    if(typeof region.id!=='string'||!region.id||nodeMeshes.has(region.id)) throw new TypeError('Region IDs must be unique nonempty strings.');
    if(!Array.isArray(region.position)||region.position.length!==3||!region.position.every(Number.isFinite)) throw new TypeError(`Invalid coordinates for region ${region.id}.`);
    const color=networkColor(region.network);
    const node=new THREE.Mesh(sphere,material(color,{emissive:color,emissiveIntensity:0.2,roughness:0.34}));
    node.position.copy(position(region.position));
    const deep=/hippocampus|amygdala|striatum|thalamus/.test(region.id);
    const brainstem=/raphe|^lc$/.test(region.id);
    const radius=brainstem?2.8:deep?4.1:4.6;
    node.scale.set(radius,deep?radius*0.82:radius,radius);
    node.renderOrder=3;
    tag(node,region.name||region.id,`${region.role||'Modeled regional population.'} Approximate, unregistered center; marker size is symbolic. Inspect each target's PET reference or estimated fallback; population response remains estimated.`, 'brain-region',
      {regionId:region.id,id:region.id,network:region.network,sourcePosition:[...region.position],receptorDensities:{...region.receptorDensities},baseColor:color,baseScale:node.scale.toArray(),deep,activity:0,delta:0});
    const outline=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.52,depthWrite:false}));
    outline.scale.setScalar(1.35);
    outline.rotation.x=Math.PI/2;
    outline.userData={type:'region-halo',regionId:region.id};
    node.add(outline);
    nodeMeshes.set(region.id,node);group.add(node);
  }
  const connectionGroup=tag(new THREE.Group(),'Modeled regional connections','Directed model connections with assumed weights and delays. Curves are not diffusion MRI tractography or reconstructed axons.','brain-connections');
  for(const connection of connections) {
    const from=nodeMeshes.get(connection.from),to=nodeMeshes.get(connection.to);
    if(!from||!to) throw new RangeError(`Connection references missing region ${connection.from} or ${connection.to}.`);
    const start=from.position.clone(),end=to.position.clone();
    const midpoint=start.clone().lerp(end,0.5);
    const direction=end.clone().sub(start);
    if(direction.lengthSq()<1e-10) throw new RangeError('Self/coincident regional connection has no drawable path.');
    const perpendicular=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0));
    if(perpendicular.lengthSq()<1e-10) perpendicular.set(0,0,1);
    perpendicular.normalize();
    midpoint.addScaledVector(perpendicular,3+(hash(`${connection.from}:${connection.to}`)%10));
    const curve=new THREE.CatmullRomCurve3([start,midpoint,end],false,'centripetal');
    const inhibitory=Number(connection.weight)<0;
    const color=inhibitory?0xb28ac7:0x74b5aa;
    // Each edge owns its material, so selecting/modulating one cannot recolor all.
    const edge=new THREE.Mesh(new THREE.TubeGeometry(curve,22,0.24,5,false),material(color,{transparent:true,opacity:0.2,depthWrite:false,emissive:color,emissiveIntensity:0.05}));
    tag(edge,`${from.name} → ${to.name}`,'One directed model edge. Geometric curvature is illustrative; weight and delay are model assumptions.','brain-connection',
      {from:connection.from,to:connection.to,weight:connection.weight,delayMs:connection.delayMs,curve,baseColor:color});
    edge.renderOrder=2;
    edges.push(edge);connectionGroup.add(edge);
  }
  group.add(connectionGroup);
  function setSurfaceOpacity(value) {
    if(!Number.isFinite(value)) throw new TypeError('Surface opacity must be finite.');
    opacity=clamp01(value);
    cortex.children.forEach(mesh=>{mesh.material.opacity=opacity;mesh.material.depthWrite=false;});
    group.userData.surfaceOpacity=opacity;
  }
  function setCutaway(value) {
    cutaway=Boolean(value);
    cortex.children.forEach(mesh=>{mesh.visible=!(cutaway&&mesh.userData.hemisphere==='right');});
    group.userData.cutaway=cutaway;
    group.userData.cutawayDescription=cutaway?'Right cortical hemisphere hidden to expose medial/deep model nodes; no anatomy has been surgically resectioned.':'Both cortical hemispheres visible.';
  }
  function setConnections(value) { connectionsVisible=Boolean(value);connectionGroup.visible=activityVisible&&connectionsVisible;group.userData.connectionsVisible=connectionsVisible; }
  function setActivityVisible(value) {
    activityVisible=Boolean(value);group.userData.activityVisible=activityVisible;
    nodeMeshes.forEach(node=>{node.visible=activityVisible;});
    connectionGroup.visible=activityVisible&&connectionsVisible;
  }
  function refreshNode(node) {
    const base=new THREE.Color(node.userData.baseColor);
    const delta=node.userData.delta;
    const magnitude=Math.min(1,Math.abs(delta)*3);
    node.material.color.copy(base).lerp(new THREE.Color(delta>=0?0xffcc8b:0x799cdf),magnitude*0.58);
    node.material.emissive.copy(node.material.color);
    node.material.emissiveIntensity=0.12+node.userData.activity*0.5+(selected===node.userData.regionId?0.55:0);
    const scale=selected===node.userData.regionId?1.15:1;
    node.scale.fromArray(node.userData.baseScale).multiplyScalar(scale);
    node.children[0].material.opacity=selected===node.userData.regionId?0.95:0.36;
  }
  function update(brainStats={}) {
    if(disposed)return;
    const entries=Array.isArray(brainStats.regional)?brainStats.regional:Object.entries(brainStats.regional||{}).map(([id,value])=>({...value,id}));
    const states=new Map(entries.map(entry=>[entry.id,entry]));
    for(const [id,node] of nodeMeshes) {
      const state=states.get(id);
      node.userData.activity=clamp01(state?.e);
      node.userData.delta=Number.isFinite(state?.delta)?Math.max(-1,Math.min(1,state.delta)):0;
      node.userData.inhibitoryActivity=clamp01(state?.i);
      refreshNode(node);
    }
    for(const edge of edges) {
      const from=nodeMeshes.get(edge.userData.from),to=nodeMeshes.get(edge.userData.to);
      const activity=(from.userData.activity+to.userData.activity)/2;
      edge.material.opacity=0.1+activity*0.22;
      edge.material.emissiveIntensity=0.03+activity*0.26;
    }
  }
  function selectRegion(id) {
    selected=nodeMeshes.has(id)?id:null;
    group.userData.selectedRegion=selected;
    nodeMeshes.forEach(refreshNode);
    return selected?nodeMeshes.get(selected):null;
  }
  function dispose() {
    if(disposed)return;
    // The internal layer owns its materials and label textures. Removing it
    // before traversal ensures parent disposal never disposes them twice.
    internal.dispose();
    const geometries=new Set(),materials=new Set();
    group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const item of Array.isArray(object.material)?object.material:[object.material])materials.add(item);});
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(item=>item.dispose());
    // Empty models also allocate primitive templates before discovering no nodes.
    if(!geometries.has(sphere))sphere.dispose();if(!geometries.has(ring))ring.dispose();
    group.removeFromParent();disposed=true;group.userData.disposed=true;
  }
  setSurfaceOpacity(opacity);setCutaway(false);setConnections(true);setActivityVisible(true);
  return {group,cortex,internal,nodeMeshes,edges,setSurfaceOpacity,setCutaway,setConnections,setActivityVisible,update,selectRegion,dispose};
}
