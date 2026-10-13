import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createBrainAnatomy} from '../src/brain-geometry.js';
import {REGIONS,CONNECTIONS} from '../src/brain.js';

const surface=JSON.parse(readFileSync(new URL('../public/data/brain-surface.json',import.meta.url)));
const regions=[
  {id:'dlpfc_l',name:'Left dorsolateral prefrontal cortex',network:'executive',position:[-42,36,32],role:'Illustrative executive population.',receptorDensities:{D2:0.4}},
  {id:'hippocampus_r',name:'Right hippocampus',network:'memory',position:[28,-20,-16],role:'Illustrative memory population.',receptorDensities:{HT1A:0.8}},
  {id:'raphe',name:'Raphe nuclei',network:'modulatory',position:[0,-28,-30],role:'Illustrative modulatory population.',receptorDensities:{HT1A:0.9}},
];
const connections=[{from:'raphe',to:'dlpfc_l',weight:0.4,delayMs:8},{from:'dlpfc_l',to:'hippocampus_r',weight:-0.15,delayMs:14}];
const transform=([x,y,z])=>new THREE.Vector3(x,z,-y);
const near=(a,b,message,tolerance=1e-5)=>assert.ok(a.distanceTo(b)<tolerance,`${message}: ${a.toArray()} vs ${b.toArray()}`);

test('bundled cortical surfaces retain full fsaverage5 topology, finite 3D folds and source provenance',()=>{
  assert.equal(surface.provenance.version,'0.12.1');
  assert.match(surface.coordinateFrame,/Not registered to MNI152/);
  assert.ok(surface.provenance.licenseText.includes('Redistribution'));
  for(const side of ['left','right']) {
    const hemi=surface.hemispheres[side];
    assert.equal(hemi.vertexCount,10242);assert.equal(hemi.triangleCount,20480);
    assert.equal(hemi.positions.length,hemi.vertexCount*3);assert.equal(hemi.sulcalDepth.length,hemi.vertexCount);
    assert.ok(hemi.positions.every(Number.isFinite));assert.ok(hemi.sulcalDepth.every(Number.isFinite));
    assert.ok(hemi.sulcalDepth.some(v=>v<0)&&hemi.sulcalDepth.some(v=>v>0),'shading includes gyral and sulcal variation');
    const canonical=Buffer.alloc(hemi.positions.length*8);
    hemi.positions.forEach((coordinate,index)=>canonical.writeDoubleLE(coordinate,index*8));
    const digest=createHash('sha256').update(canonical).digest('hex');
    assert.equal(digest,hemi.positionFloat64LE_SHA256,'converted coordinate payload matches its canonical checksum');
    const edges=new Map();
    for(let i=0;i<hemi.indices.length;i+=3) {
      const tri=hemi.indices.slice(i,i+3);
      assert.equal(new Set(tri).size,3,'triangle has three distinct vertices');
      const points=tri.map(id=>{
        assert.ok(Number.isInteger(id)&&id>=0&&id<hemi.vertexCount);
        return new THREE.Vector3(...hemi.positions.slice(id*3,id*3+3));
      });
      assert.ok(points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).lengthSq()>1e-10,'no zero-area faces');
      for(const [a,b] of [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]]) {
        const key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);
      }
    }
    assert.ok([...edges.values()].every(count=>count===2),'closed surface has two incident faces per undirected edge');
    assert.equal(hemi.vertexCount-edges.size+hemi.triangleCount,2,'hemisphere has preserved closed spherical mesh topology');
    const source=surface.provenance.sources.find(s=>s.hemisphere===side&&s.kind==='pial');
    assert.match(source.url,/^https:\/\/raw\.githubusercontent\.com\/nilearn\/nilearn\/0\.12\.1\//);
    assert.match(source.sha256,/^[a-f0-9]{64}$/);
  }
});

test('native cortical coordinates and approximate regions undergo the same proper axis rotation only',()=>{
  const sourceBefore=JSON.stringify(regions);
  const anatomy=createBrainAnatomy({regions,connections,surface});
  for(const side of ['left','right']) {
    const mesh=anatomy.cortex.children.find(m=>m.userData.hemisphere===side);
    const data=surface.hemispheres[side],p=mesh.geometry.getAttribute('position');
    for(const id of [0,1,143,4871,10241]) near(new THREE.Vector3().fromBufferAttribute(p,id),transform(data.positions.slice(id*3,id*3+3)),`${side} vertex ${id}`);
    assert.equal(mesh.geometry.index.count,data.indices.length);
  }
  for(const region of regions) {
    const node=anatomy.nodeMeshes.get(region.id);
    near(node.position,transform(region.position),region.id,1e-12);
    assert.equal(node.userData.regionId,region.id);
    assert.deepEqual(node.userData.receptorDensities,region.receptorDensities);
  }
  const originalDistance=new THREE.Vector3(...regions[0].position).distanceTo(new THREE.Vector3(...regions[1].position));
  assert.ok(Math.abs(anatomy.nodeMeshes.get(regions[0].id).position.distanceTo(anatomy.nodeMeshes.get(regions[1].id).position)-originalDistance)<1e-10,'rotation preserves inter-region distances');
  const axes=[[1,0,0],[0,1,0],[0,0,1]].map(transform);
  assert.equal(axes[0].clone().cross(axes[1]).dot(axes[2]),1,'display transform does not reflect left/right handedness');
  assert.equal(JSON.stringify(regions),sourceBefore);anatomy.dispose();
});

test('complete brain-engine region and connection definitions integrate without dropped populations',()=>{
  const anatomy=createBrainAnatomy({regions:REGIONS,connections:CONNECTIONS,surface});
  assert.equal(anatomy.nodeMeshes.size,REGIONS.length);
  assert.equal(anatomy.edges.length,CONNECTIONS.length);
  for(const region of REGIONS)near(anatomy.nodeMeshes.get(region.id).position,transform(region.position),region.id);
  for(const connection of CONNECTIONS)assert.ok(anatomy.edges.some(edge=>edge.userData.from===connection.from&&edge.userData.to===connection.to&&edge.userData.weight===connection.weight));
  anatomy.dispose();
});

test('edges preserve supplied direction and weights, with independent activity materials',()=>{
  const anatomy=createBrainAnatomy({regions,connections,surface});
  assert.equal(anatomy.edges.length,connections.length);
  connections.forEach((connection,index)=>{
    const edge=anatomy.edges[index];
    assert.equal(edge.userData.from,connection.from);assert.equal(edge.userData.to,connection.to);
    assert.equal(edge.userData.weight,connection.weight);assert.equal(edge.userData.delayMs,connection.delayMs);
    near(edge.userData.curve.getPoint(0),anatomy.nodeMeshes.get(connection.from).position,'source');
    near(edge.userData.curve.getPoint(1),anatomy.nodeMeshes.get(connection.to).position,'target');
  });
  assert.notEqual(anatomy.edges[0].material,anatomy.edges[1].material);
  assert.notEqual(anatomy.nodeMeshes.get('dlpfc_l').material,anatomy.nodeMeshes.get('hippocampus_r').material);
  anatomy.update({regional:[{id:'dlpfc_l',e:0.9,i:0.3,delta:0.25},{id:'hippocampus_r',e:0.1,i:0.2,delta:-0.15},{id:'raphe',e:0.2,i:0.1,delta:0}]});
  assert.ok(anatomy.nodeMeshes.get('dlpfc_l').material.emissiveIntensity>anatomy.nodeMeshes.get('hippocampus_r').material.emissiveIntensity);
  assert.notEqual(anatomy.nodeMeshes.get('dlpfc_l').material.color.getHex(),anatomy.nodeMeshes.get('hippocampus_r').material.color.getHex());
  anatomy.dispose();
});

test('cutaway, opacity, connections and selection compose without hiding regional state',()=>{
  const anatomy=createBrainAnatomy({regions,connections,surface});
  const left=anatomy.cortex.children.find(m=>m.userData.hemisphere==='left'),right=anatomy.cortex.children.find(m=>m.userData.hemisphere==='right');
  anatomy.setSurfaceOpacity(0.63);anatomy.setCutaway(true);anatomy.setConnections(false);
  assert.equal(left.visible,true);assert.equal(right.visible,false);
  assert.ok([...anatomy.nodeMeshes.values()].every(node=>node.visible));
  assert.ok(anatomy.edges.every(edge=>edge.parent.visible===false));
  const original=anatomy.nodeMeshes.get('raphe').scale.clone();
  for(let i=0;i<10;i++){anatomy.selectRegion('raphe');anatomy.update({regional:[{id:'raphe',e:0.3,delta:0.1}]});}
  near(anatomy.nodeMeshes.get('raphe').scale,original.clone().multiplyScalar(1.15),'selection scale does not accumulate');
  anatomy.selectRegion(null);near(anatomy.nodeMeshes.get('raphe').scale,original,'deselect restores scale');
  anatomy.setCutaway(false);anatomy.setConnections(true);
  assert.equal(right.visible,true);assert.equal(left.material.opacity,0.63);assert.equal(right.material.opacity,0.63);
  assert.ok(anatomy.edges.every(edge=>edge.parent.visible));anatomy.dispose();
});

test('surface and network geometry is finite, with explicitly labeled fallback and safe disposal ownership',()=>{
  const a=createBrainAnatomy({regions,connections,surface}),b=createBrainAnatomy({regions,connections});
  assert.ok(b.cortex.children.every(mesh=>mesh.userData.source==='procedural fallback'));
  for(const model of [a,b]) {
    model.group.updateMatrixWorld(true);
    model.group.traverse(object=>{
      assert.ok(object.matrixWorld.elements.every(Number.isFinite));
      if(!object.geometry)return;
      for(const name of ['position','normal']) {const attribute=object.geometry.getAttribute(name);if(attribute)assert.ok(attribute.array.every(Number.isFinite));}
    });
    const size=new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    assert.ok(size.x>100&&size.x<180&&size.y>100&&size.y<200&&size.z>140&&size.z<220);
  }
  const tracked=new Map();
  a.group.traverse(object=>{
    for(const resource of [object.geometry,...(Array.isArray(object.material)?object.material:[object.material])].filter(Boolean)) {
      if(tracked.has(resource))continue;tracked.set(resource,0);resource.addEventListener('dispose',()=>tracked.set(resource,tracked.get(resource)+1));
    }
  });
  let otherDisposed=false;b.nodeMeshes.get('raphe').material.addEventListener('dispose',()=>{otherDisposed=true;});
  a.dispose();a.dispose();assert.ok([...tracked.values()].every(count=>count===1));assert.equal(otherDisposed,false,'disposing one scene cannot dispose another scene resources');
  b.dispose();
});

test('invalid region coordinates, IDs, surface topology and edge endpoints fail before misleading rendering',()=>{
  assert.throws(()=>createBrainAnatomy({regions:[{id:'bad',position:[0,NaN,1]}]}),/coordinates/);
  assert.throws(()=>createBrainAnatomy({regions:[regions[0],regions[0]]}),/unique/);
  assert.throws(()=>createBrainAnatomy({regions,connections:[{from:'missing',to:'raphe'}]}),/missing/);
  assert.throws(()=>createBrainAnatomy({surface:{hemispheres:{left:{positions:[0,0,0],indices:[0,1,2]}}}}),/triangle index/);
});
