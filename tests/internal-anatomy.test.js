import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ANATOMY_STRUCTURES} from '../src/anatomy-data.js';
import {createInternalAnatomy,INTERNAL_ANATOMY_ANCHORS} from '../src/internal-anatomy.js';
import {createBrainAnatomy} from '../src/brain-geometry.js';

const position=([x,y,z])=>new THREE.Vector3(x,z,-y);
const firstMesh=object=>{let result;object.traverse(child=>{if(!result&&child.isMesh)result=child;});return result;};
const near=(actual,expected,tolerance=1e-5)=>assert.ok(actual.distanceTo(expected)<tolerance,`${actual.toArray()} versus ${expected.toArray()}`);

test('internal anatomy has documented selectable structures, paired nuclei and differentiated curved geometry',()=>{
  const anatomy=createInternalAnatomy();
  assert.equal(anatomy.structures.size,18);
  for(const [id,group] of anatomy.structures){
    const record=ANATOMY_STRUCTURES.find(item=>item.id===id);
    assert.ok(record,`${id} has scientific context`);
    assert.equal(group.userData.anatomyId,id);assert.equal(group.userData.label,record.name);
    assert.equal(group.userData.schematic,true);assert.match(group.userData.description,/unregistered/);
    assert.ok(group.children.length>0);
    group.traverse(mesh=>{
      if(!mesh.isMesh)return;
      assert.equal(mesh.userData.type,'internal-anatomy');assert.equal(mesh.userData.anatomyId,id);
      assert.ok(mesh.userData.description.length>20);
    });
  }
  for(const id of ['thalamus','hippocampus','amygdala','caudate','putamen','globus-pallidus','cerebellum']){
    const sides=new Set(anatomy.structures.get(id).children.map(mesh=>mesh.userData.hemisphere));
    assert.ok(sides.has('left')&&sides.has('right'),`${id} is bilateral`);
  }
  for(const id of ['corpus-callosum','hippocampus','caudate','ventricles','pituitary-stalk','spinal-cord'])
    assert.ok(anatomy.structures.get(id).children.some(mesh=>mesh.geometry.type==='TubeGeometry'),`${id} has a continuous curved form`);
  assert.ok(anatomy.structures.get('cerebellum').children.some(mesh=>mesh.userData.part?.includes('foliated')));
  anatomy.dispose();
});

test('deep brain, gland and CNS positional relationships survive the proper axis transform',()=>{
  const a=INTERNAL_ANATOMY_ANCHORS;
  assert.ok(a['corpus-callosum'][2]>a.thalamus[2]);
  assert.ok(a.thalamus[2]>a.hypothalamus[2]);
  assert.ok(a.hypothalamus[2]>a['pituitary-stalk'][2]);
  assert.ok(a['pituitary-stalk'][2]>a['posterior-pituitary'][2]);
  assert.ok(a['anterior-pituitary'][1]>a['posterior-pituitary'][1]);
  assert.ok(a.midbrain[2]>a.pons[2]&&a.pons[2]>a.medulla[2]&&a.medulla[2]>a['spinal-cord'][2]);
  assert.ok(a.cerebellum[1]<a.pons[1]);
  assert.ok(a.amygdala[1]>a.hippocampus[1]);
  const anatomy=createInternalAnatomy();
  for(const [id,node] of anatomy.structures)assert.deepEqual(node.userData.sourcePosition,a[id]);
  const stalk=firstMesh(anatomy.structures.get('pituitary-stalk')).userData.curve;
  near(stalk.getPoint(0),position([0,-6,-10]));near(stalk.getPoint(1),position([0,-1,-22]));
  const cord=firstMesh(anatomy.structures.get('spinal-cord'));
  assert.match(cord.userData.part,/upper cervical.*only/);
  near(cord.userData.curve.getPoint(0),position([0,-34,-58]));
  assert.ok(cord.userData.curve.getPoint(0).distanceTo(firstMesh(anatomy.structures.get('medulla')).userData.curve.getPoint(1))<2,'cord continues from medulla');
  anatomy.dispose();
});

test('endocrine pathways distinguish blood portal vessels from neurosecretory axons without changing anatomy',()=>{
  const anatomy=createInternalAnatomy();
  assert.equal(anatomy.group.userData.pathway,null);
  assert.ok([...anatomy.pathways.values()].every(node=>!node.visible));
  const anterior=anatomy.pathways.get('anterior'),posterior=anatomy.pathways.get('posterior');
  assert.match(anterior.userData.description,/portal vessels/);
  assert.match(posterior.userData.description,/synthesize oxytocin and vasopressin/);
  assert.ok(anterior.children.filter(mesh=>mesh.userData.part==='capillary plexus').length===2);
  assert.ok(posterior.children.some(mesh=>mesh.userData.part==='hypothalamic neurosecretory axon'));
  for(const route of [anterior,posterior])assert.ok(route.children.some(mesh=>mesh.userData.part==='hormone release to systemic blood'));
  near(firstMesh(anterior).userData.curve.getPoint(1),position(INTERNAL_ANATOMY_ANCHORS['anterior-pituitary']));
  near(firstMesh(posterior).userData.curve.getPoint(1),position(INTERNAL_ANATOMY_ANCHORS['posterior-pituitary']));
  anatomy.setPathway('anterior');assert.equal(anterior.visible,true);assert.equal(posterior.visible,false);
  assert.ok(firstMesh(anatomy.structures.get('hypothalamus')).material.opacity > firstMesh(anatomy.structures.get('hippocampus')).material.opacity,'hormone route view fades surrounding structures so glands remain inspectable');
  const geometryBefore=Array.from(firstMesh(anatomy.structures.get('hypothalamus')).geometry.attributes.position.array);
  const tracer=anterior.children.find(mesh=>mesh.userData.decorative);
  const before=tracer.position.clone();anatomy.update(1.7);
  assert.ok(tracer.position.distanceTo(before)>0.1);
  assert.deepEqual(Array.from(firstMesh(anatomy.structures.get('hypothalamus')).geometry.attributes.position.array),geometryBefore,'route animation never alters structure or neuron geometry');
  anatomy.setPathway('posterior');assert.equal(anterior.visible,false);assert.equal(posterior.visible,true);
  anatomy.setPathway(null);assert.ok([...anatomy.pathways.values()].every(node=>!node.visible));
  assert.throws(()=>anatomy.setPathway('unknown'),/Unknown/);assert.throws(()=>anatomy.update(NaN),/finite/);
  anatomy.dispose();
});

test('selection is reversible, does not change physical scale, and isolates its material resources',()=>{
  const anatomy=createInternalAnatomy();
  const hypo=firstMesh(anatomy.structures.get('hypothalamus')),thalamus=firstMesh(anatomy.structures.get('thalamus'));
  const scale=hypo.scale.clone(),opacity=thalamus.material.opacity;
  const first=hypo.material;
  assert.notEqual(first,thalamus.material);
  assert.equal(anatomy.select('hypothalamus'),anatomy.structures.get('hypothalamus'));
  assert.ok(first.emissiveIntensity>thalamus.material.emissiveIntensity);
  assert.ok(thalamus.material.opacity<opacity);
  for(let i=0;i<10;i++)anatomy.select('hypothalamus');
  near(hypo.scale,scale);
  anatomy.setVisible(false);anatomy.select('pons');assert.equal(anatomy.group.visible,false);
  anatomy.setVisible(true);assert.equal(anatomy.select('missing'),null);
  assert.equal(thalamus.material.opacity,opacity);near(hypo.scale,scale);
  anatomy.dispose();
});

test('labels remain optional in headless environments, selected labels persist, and textures are disposed once',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({measureText:text=>({width:text.length*12}),fillRect(){},strokeRect(){},fillText(){}})})};
  try{
    const anatomy=createInternalAnatomy();assert.equal(anatomy.labels.size,18);
    assert.ok([...anatomy.labels.values()].every(label=>!label.visible));
    anatomy.select('hypothalamus');assert.equal(anatomy.labels.get('hypothalamus').visible,true);
    assert.equal([...anatomy.labels.values()].filter(label=>label.visible).length,1);
    anatomy.setLabels(true);assert.ok([...anatomy.labels.values()].every(label=>label.visible));
    anatomy.setLabels(false);assert.equal([...anatomy.labels.values()].filter(label=>label.visible).length,1);
    anatomy.select(null);assert.ok([...anatomy.labels.values()].every(label=>!label.visible));
    let count=0;anatomy.labels.get('hypothalamus').material.map.addEventListener('dispose',()=>count++);
    anatomy.dispose();anatomy.dispose();assert.equal(count,1);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('geometry is finite and disposal owns each resource without touching another model',()=>{
  const a=createInternalAnatomy(),b=createInternalAnatomy();
  const resources=new Map();a.group.updateMatrixWorld(true);
  a.group.traverse(object=>{
    assert.ok(object.matrixWorld.elements.every(Number.isFinite));
    if(object.geometry)for(const attribute of Object.values(object.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
    for(const resource of [object.geometry,object.material].filter(Boolean)){
      if(resources.has(resource))continue;
      resources.set(resource,0);resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));
    }
  });
  const size=new THREE.Box3().setFromObject(a.group).getSize(new THREE.Vector3());
  assert.ok(size.x>80&&size.x<110);assert.ok(size.y>120&&size.y<150);assert.ok(size.z>90&&size.z<130);
  let disposedOther=false;firstMesh(b.structures.get('hypothalamus')).material.addEventListener('dispose',()=>{disposedOther=true;});
  a.dispose();a.dispose();assert.ok([...resources.values()].every(value=>value===1));assert.equal(disposedOther,false);
  assert.equal(a.group.userData.disposed,true);b.dispose();
});

test('activity visibility and connection preference compose independently of anatomical selection',()=>{
  const brain=createBrainAnatomy({regions:[{id:'a',position:[10,0,15]},{id:'b',position:[-10,0,15]}],connections:[{from:'a',to:'b',weight:0.5}]});
  brain.update({regional:[{id:'a',e:0.5,i:0.3,delta:0.1}]});
  const node=brain.nodeMeshes.get('a'),activity=node.userData.activity,color=node.material.color.getHex();
  brain.setConnections(false);brain.setActivityVisible(false);brain.internal.select('thalamus');
  assert.equal(node.visible,false);assert.equal(brain.edges[0].parent.visible,false);
  assert.equal(node.userData.activity,activity);assert.equal(node.material.color.getHex(),color);
  brain.setActivityVisible(true);assert.equal(node.visible,true);assert.equal(brain.edges[0].parent.visible,false);
  brain.setConnections(true);assert.equal(brain.edges[0].parent.visible,true);
  brain.setActivityVisible(false);brain.setConnections(true);assert.equal(brain.edges[0].parent.visible,false);
  brain.setActivityVisible(true);assert.equal(brain.edges[0].parent.visible,true);
  const resources=new Map();brain.internal.group.traverse(object=>{for(const resource of [object.geometry,object.material].filter(Boolean)){if(resources.has(resource))continue;resources.set(resource,0);resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));}});
  brain.dispose();brain.dispose();assert.ok([...resources.values()].every(count=>count===1),'parent disposes internal resources exactly once');
});
