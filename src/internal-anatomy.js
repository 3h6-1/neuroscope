import * as THREE from 'three';
import { ANATOMY_STRUCTURES } from './anatomy-data.js';

// All construction coordinates are approximate RAS-like millimetres. These are
// teaching shapes, not atlas segmentations or registered patient anatomy.
export const INTERNAL_ANATOMY_ANCHORS = Object.freeze({
  'corpus-callosum':[0,-5,29], thalamus:[0,-16,8], hypothalamus:[0,-7,-7],
  'anterior-pituitary':[0,3,-24], 'posterior-pituitary':[0,-2,-23], 'pituitary-stalk':[0,-3,-16],
  hippocampus:[0,-25,-13], amygdala:[0,-2,-17], caudate:[0,-3,18], putamen:[0,2,5],
  'globus-pallidus':[0,-1,4], ventricles:[0,-12,15], pineal:[0,-27,3],
  cerebellum:[0,-55,-35], midbrain:[0,-23,-16], pons:[0,-27,-31], medulla:[0,-33,-49],
  'spinal-cord':[0,-35,-79],
});
const metadata = new Map(ANATOMY_STRUCTURES.map(item => [item.id,item]));
const ras = point => new THREE.Vector3(point[0],point[2],-point[1]);
const colors = {
  'corpus-callosum':0xe8d8ac, thalamus:0xb49aca, hypothalamus:0xf2b15f,
  'anterior-pituitary':0xef8c87, 'posterior-pituitary':0xe1a5cb, 'pituitary-stalk':0xd9b998,
  hippocampus:0x93c5a3, amygdala:0xd28da8, caudate:0x78b8c1, putamen:0x6da6ba,
  'globus-pallidus':0xa8bb8b, ventricles:0x73cbe4, pineal:0xd1b0dc,
  cerebellum:0x889cba, midbrain:0xc1ab87, pons:0xcab999, medulla:0xb3b8a4, 'spinal-cord':0xa8c6b7,
};

function tag(object,id,extra={}) {
  const record=metadata.get(id);
  object.name=record?.name || id;
  object.userData={type:'internal-anatomy',anatomyId:id,label:record?.name || id,
    description:`${record?.role || 'Anatomical reference structure.'} Schematic, unregistered teaching geometry; shape, scale and position are approximate.`,
    coordinateFrame:'RAS-like millimetres rotated [x,y,z] → [x,z,-y]; not registered to the cortical mesh',
    ...extra};
  return object;
}

function material(color,opacity=0.88) {
  const mat=new THREE.MeshStandardMaterial({color,roughness:0.64,metalness:0.03,emissive:color,emissiveIntensity:0.035,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
  mat.userData={baseOpacity:opacity,baseEmissiveIntensity:0.035};
  return mat;
}
function ellipsoid(center,radii,mat,detail=24) {
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,detail,Math.round(detail*0.7)),mat);
  mesh.position.copy(ras(center));mesh.scale.set(radii[0],radii[2],radii[1]);
  return mesh;
}
function tube(points,radius,mat,segments=40) {
  const curve=new THREE.CatmullRomCurve3(points.map(ras),false,'centripetal');
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,10,false),mat);
  mesh.userData.curve=curve;
  return mesh;
}
function makeLabel(text,color) {
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  if(!context)return null;
  const font='500 25px sans-serif';context.font=font;
  canvas.width=Math.ceil(context.measureText(text).width)+28;canvas.height=48;
  context.font=font;context.fillStyle='rgba(11,22,30,0.90)';context.fillRect(0,0,canvas.width,canvas.height);
  context.strokeStyle=`#${new THREE.Color(color).getHexString()}`;context.lineWidth=2;context.strokeRect(1,1,canvas.width-2,canvas.height-2);
  context.fillStyle='#edf5f4';context.textBaseline='middle';context.fillText(text,14,25);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));
  sprite.scale.set(canvas.width*0.105,5.04,1);sprite.renderOrder=12;
  // Keep labels readable while zooming without letting one label fill the view.
  sprite.onBeforeRender=(renderer,scene,camera)=>{
    const height=renderer.domElement.clientHeight;
    if(!height||!camera.isPerspectiveCamera)return;
    const distance=camera.position.distanceTo(sprite.getWorldPosition(new THREE.Vector3()));
    const size=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*distance*17/height;
    sprite.scale.set(size*canvas.width/canvas.height,size,1);
  };
  return sprite;
}

/** Context anatomy independent of every regional activity/drug model. */
export function createInternalAnatomy() {
  const group=new THREE.Group();group.name='Internal brain and central nervous system · schematic';
  group.userData={type:'internal-anatomy-context',schematic:true,registered:false,units:'approximate mm',
    description:'Selected major internal structures with an upper cervical cord segment; not a complete neuroanatomical atlas.',
    selected:null,labelsVisible:false,pathway:null};
  const structures=new Map(),labels=new Map(),pathways=new Map(),tracers=[];
  let selected=null,labelsVisible=false,disposed=false;
  function structure(id) {
    const node=tag(new THREE.Group(),id,{sourcePosition:[...INTERNAL_ANATOMY_ANCHORS[id]],schematic:true});
    node.renderOrder=3;structures.set(id,node);group.add(node);return node;
  }
  function add(node,mesh,extra={}) {
    const curve=mesh.userData.curve;
    tag(mesh,node.userData.anatomyId,{...extra,...(curve?{curve}:{})});
    mesh.renderOrder=3;node.add(mesh);return mesh;
  }
  function paired(node,build) {for(const side of [-1,1])build(side,side<0?'left':'right');}

  const callosum=structure('corpus-callosum');
  const arch=tube([[0,22,7],[0,31,15],[0,27,26],[0,10,31],[0,-14,32],[0,-35,27],[0,-39,19]],4.2,material(colors['corpus-callosum']),64);
  arch.scale.x=1.65;add(callosum,arch,{part:'rostrum, genu, body and splenium'});
  // A few commissural bundles indicate transverse white-matter direction.
  for(const y of [-27,-12,4,18])add(callosum,tube([[-13,y,24],[-6,y,29],[0,y,30],[6,y,29],[13,y,24]],0.55,material(0xf1e8cd,0.72),24),{part:'illustrative commissural fibers'});

  const thalamus=structure('thalamus');
  paired(thalamus,(side,hemisphere)=>add(thalamus,ellipsoid([side*11,-16,8],[8,13,9],material(colors.thalamus)),{hemisphere}));
  const hypothalamus=structure('hypothalamus');
  add(hypothalamus,ellipsoid([0,-7,-7],[7,7,5],material(colors.hypothalamus)));
  paired(hypothalamus,(side,hemisphere)=>add(hypothalamus,ellipsoid([side*3,-13,-11],[2.1,2.3,2],material(0xd49a51),16),{hemisphere,part:'mammillary body positional landmarks'}));
  const anterior=structure('anterior-pituitary');
  add(anterior,ellipsoid([0,3,-24],[6,4.5,3.3],material(colors['anterior-pituitary'])));
  const posterior=structure('posterior-pituitary');
  add(posterior,ellipsoid([0,-2,-23],[3.5,2.5,3],material(colors['posterior-pituitary'])));
  const stalk=structure('pituitary-stalk');
  add(stalk,tube([[0,-6,-10],[0,-3,-15],[0,-1,-20],[0,-1,-22]],1.4,material(colors['pituitary-stalk'],0.58),24));

  const hippocampus=structure('hippocampus');
  paired(hippocampus,(side,hemisphere)=>{
    const curve=[[24,-8,-18],[29,-18,-17],[30,-29,-13],[27,-39,-7],[21,-43,-2],[16,-39,1]].map(([x,y,z])=>[side*x,y,z]);
    add(hippocampus,tube(curve,2.7,material(colors.hippocampus),48),{hemisphere,part:'curved hippocampal body and tail'});
    add(hippocampus,ellipsoid([side*24,-9,-18],[4,5,3.5],material(colors.hippocampus)),{hemisphere,part:'hippocampal head'});
  });
  const amygdala=structure('amygdala');
  paired(amygdala,(side,hemisphere)=>add(amygdala,ellipsoid([side*22,-2,-17],[4,5,4],material(colors.amygdala)),{hemisphere}));
  const caudate=structure('caudate');
  paired(caudate,(side,hemisphere)=>{
    const points=[[12,12,8],[15,7,17],[18,-9,23],[21,-28,21],[25,-36,10],[26,-25,-9]].map(([x,y,z])=>[side*x,y,z]);
    add(caudate,tube(points,2.7,material(colors.caudate),60),{hemisphere,part:'caudate body and tail'});
    add(caudate,ellipsoid([side*12,12,8],[4.6,5.5,5.8],material(colors.caudate)),{hemisphere,part:'caudate head'});
  });
  const putamen=structure('putamen');
  paired(putamen,(side,hemisphere)=>add(putamen,ellipsoid([side*24,2,5],[4.5,13,9],material(colors.putamen)),{hemisphere}));
  const pallidum=structure('globus-pallidus');
  paired(pallidum,(side,hemisphere)=>add(pallidum,ellipsoid([side*18,-1,4],[3.1,7.4,6.8],material(colors['globus-pallidus'])),{hemisphere}));

  const ventricles=structure('ventricles');
  paired(ventricles,(side,hemisphere)=>{
    add(ventricles,tube([[side*7,20,13],[side*6,7,18],[side*7,-14,19],[side*12,-31,15],[side*16,-45,10]],1.7,material(colors.ventricles,0.8),48),{hemisphere,part:'lateral ventricle: anterior horn, body and posterior horn'});
    add(ventricles,tube([[side*12,-31,15],[side*19,-35,5],[side*24,-26,-6],[side*24,-13,-12]],1.2,material(colors.ventricles,0.8),36),{hemisphere,part:'lateral ventricle temporal horn'});
    add(ventricles,tube([[side*6,0,16],[side*3,-2,12],[0,-4,8]],0.65,material(colors.ventricles),18),{hemisphere,part:'interventricular foramen schematic'});
  });
  add(ventricles,ellipsoid([0,-11,6],[0.85,10,7.5],material(colors.ventricles,0.72)),{part:'third ventricle'});
  add(ventricles,tube([[0,-20,3],[0,-25,-8],[0,-29,-20],[0,-33,-29]],0.65,material(colors.ventricles),36),{part:'cerebral aqueduct'});
  const fourth=new THREE.Mesh(new THREE.ConeGeometry(1,1,4),material(colors.ventricles,0.8));
  fourth.position.copy(ras([0,-38,-34]));fourth.scale.set(4.8,12,3.2);fourth.rotation.y=Math.PI/4;
  add(ventricles,fourth,{part:'fourth ventricle between brainstem and cerebellum'});
  const pineal=structure('pineal');
  add(pineal,ellipsoid([0,-27,3],[2.5,3.5,2.1],material(colors.pineal),20));

  const cerebellum=structure('cerebellum');
  paired(cerebellum,(side,hemisphere)=>{
    const mesh=ellipsoid([side*23,-55,-35],[23,24,16],material(colors.cerebellum),40);
    const attr=mesh.geometry.getAttribute('position');
    for(let i=0;i<attr.count;i++){
      const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i);
      const folia=1+0.038*Math.cos(Math.asin(Math.max(-1,Math.min(1,y)))*48);
      attr.setXYZ(i,x*folia,y,z*folia);
    }
    mesh.geometry.computeVertexNormals();add(cerebellum,mesh,{hemisphere,part:'foliated cerebellar hemisphere, folds illustrative'});
    add(cerebellum,tube([[side*4,-29,-31],[side*10,-36,-33],[side*17,-44,-35]],3,material(colors.cerebellum),24),{hemisphere,part:'cerebellar peduncle schematic'});
  });
  add(cerebellum,ellipsoid([0,-57,-33],[7,20,12],material(0x95a8c2)),{part:'midline vermis'});
  const midbrain=structure('midbrain');
  add(midbrain,tube([[0,-19,-8],[0,-22,-14],[0,-25,-23]],6,material(colors.midbrain),28));
  const pons=structure('pons');
  add(pons,ellipsoid([0,-27,-31],[11,9,9],material(colors.pons)));
  for(const z of [-35,-31,-27])add(pons,tube([[-9,-24,z],[-5,-19,z],[0,-18,z],[5,-19,z],[9,-24,z]],0.35,material(0xe0cba6,0.75),28),{part:'transverse pontine fiber surface guide'});
  const medulla=structure('medulla');
  add(medulla,tube([[0,-30,-38],[0,-32,-47],[0,-34,-59]],4.4,material(colors.medulla),32));
  const cord=structure('spinal-cord');
  cord.userData.description+=' Only an upper cervical segment is shown in this brain view; the circulation view supplies broader CNS context.';
  add(cord,tube([[0,-34,-58],[0,-35,-76],[0,-36,-98]],3.2,material(colors['spinal-cord']),44),{part:'upper cervical spinal cord segment only'});
  for(const z of [-67,-77,-87])for(const side of [-1,1]){
    const root=add(cord,tube([[side*2,-35,z],[side*5,-35,z-1],[side*8,-35,z-4]],0.48,material(0x85aa9a,0.58),16),{part:'nerve root reference: peripheral nervous system, not spinal cord tissue',peripheralContext:true});
    root.userData.description='A short nerve root indicates where the spinal cord communicates with the peripheral nervous system. This is peripheral context, not a simulated nerve or an additional CNS structure.';
  }

  function pathway(id,points,color,description){
    const node=new THREE.Group();node.name=`${id} pituitary route · qualitative`;node.visible=false;
    node.userData={type:'endocrine-pathway',pathwayId:id,label:node.name,description};
    const route=tube(points,0.4,material(color),48);route.renderOrder=8;
    route.userData={...node.userData,curve:route.userData.curve};node.add(route);
    const tracer=ellipsoid([0,0,0],[0.7,0.7,0.7],material(color));tracer.renderOrder=9;tracer.userData={...node.userData,decorative:true};node.add(tracer);
    tracers.push({object:tracer,curve:route.userData.curve,id});
    pathways.set(id,node);group.add(node);return node;
  }
  const portal=pathway('anterior',[[0,-7,-10],[1.8,-5,-13],[1.7,-2,-18],[1.5,1,-22],[0,3,-24]],0xff766c,
    'Hypothalamic releasing or inhibiting hormones enter the median eminence capillary bed, travel through portal vessels, and reach anterior pituitary endocrine cells. Tracer speed is illustrative, not a secretion or blood-flow calculation.');
  for(const center of [[0,-7,-11],[0,3,-24]]){
    const loop=[];for(let i=0;i<=24;i++){const a=2*Math.PI*i/24;loop.push([center[0]+2.6*Math.cos(a),center[1]+1.4*Math.sin(a),center[2]]);}
    const bed=tube(loop,0.27,material(0xff8b7e),32);bed.userData={...portal.userData,part:'capillary plexus'};portal.add(bed);
  }
  const neuro=pathway('posterior',[[0,-8,-5],[-1,-7,-10],[-0.8,-3,-16],[-0.8,-2,-20],[0,-2,-23]],0xdeb0ff,
    'Hypothalamic neurons synthesize oxytocin and vasopressin. Their axons terminate in the posterior pituitary, which releases these hormones into systemic blood. The tracer is a qualitative route guide, not an action potential or hormone-transport simulation.');
  for(const side of [-1,1]){
    const axon=tube([[side*2,-8,-5],[side*1,-6,-11],[side*0.6,-2,-18],[side*1.7,-2,-23]],0.2,material(0xd4a1f5),36);
    axon.userData={...neuro.userData,part:'hypothalamic neurosecretory axon'};neuro.add(axon);
  }
  for(const [node,points] of [[portal,[[0,3,-24],[-3,4,-26],[-7,6,-28],[-12,7,-31]]],[neuro,[[0,-2,-23],[3,-3,-25],[7,-5,-27],[12,-6,-30]]]]){
    const outlet=tube(points,0.52,material(0xf5be75),28);outlet.renderOrder=8;
    outlet.userData={...node.userData,part:'hormone release to systemic blood',description:'Illustrative outlet from pituitary capillaries to systemic blood. This short route is not a reconstructed vein, a measured secretion rate or a hormone concentration model.'};
    const curve=outlet.geometry.parameters.path;node.add(outlet);
    const tracer=ellipsoid([0,0,0],[0.65,0.65,0.65],material(0xf5be75));tracer.renderOrder=9;
    tracer.userData={...outlet.userData,decorative:true};node.add(tracer);
    tracers.push({object:tracer,curve,id:node.userData.pathwayId});
  }

  for(const [id,node] of structures){
    const sprite=makeLabel(`${node.userData.label} · schematic`,colors[id]);
    if(!sprite)continue;
    const anchor=INTERNAL_ANATOMY_ANCHORS[id];
    sprite.position.copy(ras(anchor)).add(new THREE.Vector3(0,10,0));
    sprite.visible=false;sprite.userData={type:'anatomy-label',anatomyId:id};
    group.add(sprite);labels.set(id,sprite);
  }
  function refreshSelection(){
    for(const [id,node] of structures)node.traverse(object=>{
      if(!object.material)return;
      const active=selected===id;
      const endocrineContext=group.userData.pathway&&['hypothalamus','anterior-pituitary','posterior-pituitary','pituitary-stalk'].includes(id);
      const dim=selected?!active:Boolean(group.userData.pathway)&&!endocrineContext;
      object.material.opacity=object.material.userData.baseOpacity*(dim?(group.userData.pathway?0.055:0.2):1);
      object.material.emissiveIntensity=active?0.34:object.material.userData.baseEmissiveIntensity;
      object.renderOrder=active?5:3;
    });
    for(const [id,sprite] of labels)sprite.visible=labelsVisible||selected===id;
  }
  function select(id){selected=structures.has(id)?id:null;group.userData.selected=selected;refreshSelection();return selected?structures.get(selected):null;}
  function setVisible(value){group.visible=Boolean(value);}
  function setLabels(value){labelsVisible=Boolean(value);group.userData.labelsVisible=labelsVisible;refreshSelection();}
  function setPathway(id){
    if(id!==null&&!pathways.has(id))throw new RangeError('Unknown endocrine pathway; use anterior, posterior or null.');
    group.userData.pathway=id;for(const [key,node] of pathways)node.visible=key===id;
    refreshSelection();
  }
  function update(timeSeconds){
    if(disposed)return;
    if(!Number.isFinite(timeSeconds))throw new TypeError('Anatomy animation time must be finite.');
    // Visual phase only: this renderer has no access to drug or firing state.
    const phase=((timeSeconds*0.22)%1+1)%1;
    for(const tracer of tracers)tracer.object.position.copy(tracer.curve.getPointAt(phase));
  }
  function dispose(){
    if(disposed)return;
    const geometries=new Set(),materials=new Set(),textures=new Set();
    group.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      if(object.material)for(const item of Array.isArray(object.material)?object.material:[object.material]){
        materials.add(item);if(item.map)textures.add(item.map);
      }
    });
    textures.forEach(item=>item.dispose());geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());
    group.removeFromParent();disposed=true;group.userData.disposed=true;
  }
  update(0);
  return {group,structures,labels,pathways,select,setVisible,setLabels,setPathway,update,dispose};
}
