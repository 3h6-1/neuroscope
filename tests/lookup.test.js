import test from 'node:test';
import assert from 'node:assert/strict';
import {inferInputKind,localMatches,searchCompounds,parsePubChemRecord,fetchStructure} from '../src/lookup.js';
import {buildMolecule} from '../src/structures.js';
const record=(z)=>({PC_Compounds:[{id:{id:{cid:999}},atoms:{aid:[2,5],element:[6,8],charge:[{aid:5,value:-1}]},bonds:{aid1:[2],aid2:[5],order:[1]},coords:[{aid:[5,2],conformers:[{x:[1,0],y:[0,0],...(z?{z:[0,0]}:{})}]}]}]});
test('identity input distinguishes formulas from names and stereochemical SMILES',()=>{assert.equal(inferInputKind('C20H25N3O'),'formula');assert.equal(inferInputKind('LSD-25'),'name');assert.equal(inferInputKind('5761'),'cid');assert.equal(inferInputKind('C[C@@H](O)N'),'smiles');assert.equal(localMatches('a',[]).length,0);});
test('formula searches expose ambiguity and do not infer identity from a curated formula',async()=>{let paths=[];const fetcher=async url=>{paths.push(url);return{ok:true,status:200,json:async()=>url.includes('fastformula')?{IdentifierList:{CID:[1,2]}}:{PropertyTable:{Properties:[{CID:1,Title:'isomer A',MolecularFormula:'C2H6O'},{CID:2,Title:'isomer B',MolecularFormula:'C2H6O'}]}}};};const r=await searchCompounds('C2H6O',{fetcher,catalog:[{id:'ethanol',name:'ethanol',formula:'C2H6O',cid:1}]});assert.equal(r.ambiguous,true);assert.equal(r.results.length,2);assert.ok(paths[0].includes('fastformula'));assert.equal(r.results[1].curatedId,null);});
test('explicit catalog aliases resolve without external network and carry profile identity',async()=>{const r=await searchCompounds('SALT NAME',{catalog:[{id:'parent',name:'Parent',aliases:['salt name'],cid:1}],fetcher:()=>{throw Error('network unexpectedly requested');}});assert.equal(r.results[0].curatedId,'parent');});
test('PubChem coordinates and connectivity use source atom IDs rather than array ordering',()=>{const p=parsePubChemRecord(record(true));assert.equal(p.atoms[0].x,-.5);assert.equal(p.atoms[1].x,.5);assert.equal(p.atoms[1].charge,-1);assert.deepEqual(p.bonds,[{a:0,b:1,order:1}]);assert.equal(p.dimension,3);assert.equal(p.units,'angstrom');});
test('2D fallback is explicitly labeled and never passes as three-dimensional coordinates',async()=>{assert.throws(()=>parsePubChemRecord(record(false)),/no 3D/);const p=await fetchStructure(999,{fetcher:async url=>url.includes('3d')?{ok:false,status:404}:{ok:true,status:200,json:async()=>record(false)}});assert.equal(p.dimension,2);assert.match(p.units,/diagram/);});
test('lookup rejects invalid input and handles network service errors',async()=>{await assert.rejects(searchCompounds(''),/Enter/);await assert.rejects(searchCompounds('-2',{kind:'cid'}),/positive/);await assert.rejects(searchCompounds('unknown',{fetcher:async()=>({ok:false,status:503})}),/unavailable/);assert.throws(()=>parsePubChemRecord({}),/Invalid/);});

test('heavy elements preserve actual identity and valid elemental formulas are recognized',()=>{
  for(const [number,symbol]of [[1,'H'],[54,'Xe'],[55,'Cs'],[64,'Gd'],[79,'Au'],[92,'U'],[118,'Og']]){
    const input=record(true);input.PC_Compounds[0].atoms.element[0]=number;
    assert.equal(parsePubChemRecord(input).atoms[0].element,symbol);
  }
  for(const formula of ['O2','H2','Cs','AuCl3','Gd2O3','UO2','Og'])assert.equal(inferInputKind(formula),'formula');
  for(const name of ['LSD','Xx2O','C0H2'])assert.equal(inferInputKind(name),'name');
  const unspecified=record(true);unspecified.PC_Compounds[0].atoms.element[0]=255;
  assert.throws(()=>parsePubChemRecord(unspecified),/unspecified atom/);
});

test('known B12 alias takes precedence over an elemental-formula heuristic in auto mode',async()=>{
  const result=await searchCompounds('B12',{catalog:[{id:'cyanocobalamin',name:'Cyanocobalamin',aliases:['B12'],cid:166596686}],fetcher:()=>{throw Error('known alias must stay local');}});
  assert.equal(result.kind,'name');assert.equal(result.results[0].curatedId,'cyanocobalamin');assert.equal(result.ambiguous,false);
});

test('PubChem quadruple and association codes retain their meaning through atom/bond inspection',()=>{
  // Independent values from NCBI PC-BondType, not SDF's aromatic encoding.
  for(const [code,label]of [[4,'Quadruple bond'],[5,'Dative bond'],[6,'Complex bond'],[7,'Ionic association'],[255,'Unspecified connection']]){
    const input=record(true);input.PC_Compounds[0].bonds.order[0]=code;
    const parsed=parsePubChemRecord(input);assert.equal(parsed.bonds[0].order,code);
    const group=buildMolecule(parsed),bond=group.children.find(c=>c.userData.type==='bond');
    assert.equal(bond.name,label);assert.equal(bond.userData.order,code);
    assert.ok(!/aromatic|single bond/i.test(bond.userData.label));
    if(code===4)assert.equal(bond.children.length,8,'quadruple bond has four two-color strokes');
    else{assert.match(bond.userData.description,/not a numerical covalent bond order/);assert.ok(bond.children.length>2,'association uses a dashed connector');}
    bond.traverse(o=>{if(o.userData.type==='bond')assert.equal(o.userData.order,code);});
  }
  const unsupported=record(true);unsupported.PC_Compounds[0].bonds.order[0]=8;
  assert.throws(()=>parsePubChemRecord(unsupported),/Unsupported/);
});

test('2D fallback atom inspection does not claim a physical 3D conformation',()=>{
  const data=parsePubChemRecord(record(false),{dimension:2,name:'2D reference'});
  const group=buildMolecule(data);
  assert.match(group.userData.units,/2D/);
  assert.match(group.userData.description,/not a physical 3D/);
  for(const atom of group.children.filter(c=>c.userData.type==='atom')){
    assert.match(atom.userData.description,/two-dimensional connectivity diagram/);
    assert.doesNotMatch(atom.userData.description,/three-dimensional conformer/);
  }
  const withoutNotes=buildMolecule({...data,notes:undefined,units:undefined});
  assert.match(withoutNotes.userData.units,/2D/);
  assert.match(withoutNotes.userData.description,/no physical three-dimensional/);
});

test('covalently attached chlorine is identified as an element rather than chloride ion',()=>{
  const input=record(true);input.PC_Compounds[0].atoms.element[0]=17;
  const atom=buildMolecule(parsePubChemRecord(input)).children.find(c=>c.userData.element==='Cl');
  assert.match(atom.userData.label,/Chlorine/);assert.doesNotMatch(atom.userData.label,/Chloride/);
});
