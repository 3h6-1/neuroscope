/** PubChem identifies molecules and supplies structures, never brain-effect predictions. */
const ROOT = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
// PC-Element and PC-BondType are defined in NCBI's source schema:
// https://www.ncbi.nlm.nih.gov/IEB/ToolBox/CPP_DOC/asn_spec/pcsubstance.asn.html
const ELEMENTS = ['', ...'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ')];
const BOND_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 255]);
export const normalizeName = value => String(value).trim().toLowerCase().replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ');
export function localMatches(query, catalog, {exact=false}={}) {
  const q=normalizeName(query); if(!q)return [];
  return catalog.filter(c=>[c.name,c.id,...(c.aliases||[]),String(c.cid)].some(v=>exact?normalizeName(v)===q:normalizeName(v).includes(q)));
}
export function inferInputKind(query) {
  const q=query.trim();
  if(/^\d+$/.test(q))return 'cid';
  if(/^(?:[A-Z][a-z]?(?:[1-9]\d*)?)+(?:[+-]\d*)?$/.test(q)&&[...q.matchAll(/[A-Z][a-z]?/g)].every(m=>ELEMENTS.includes(m[0])))return 'formula';
  if(/[\[\]@=#()\\/]/.test(q))return 'smiles';
  return 'name';
}
async function jsonRequest(path,{fetcher=fetch,signal,...options}={}) {
  const response=await fetcher(`${ROOT}${path}`,{...options,signal,headers:{Accept:'application/json',...options.headers}});
  if(response.status===404)throw new Error('No matching PubChem record or conformer was found. Try a name, CID, or explicit stereochemical SMILES.');
  if(response.status===202)throw new Error('This search requires a longer PubChem query. Narrow the formula or use an exact CID.');
  if(!response.ok)throw new Error(`PubChem is unavailable (${response.status}). The bundled library remains available offline.`);
  const data=await response.json();if(data.Fault)throw new Error(data.Fault.Message||'PubChem query failed.');return data;
}
export async function searchCompounds(query,{kind='auto',catalog=[],fetcher=fetch,signal}={}) {
  query=String(query).trim();if(!query||query.length>3000)throw new Error('Enter a molecule name, CID, formula, or SMILES (up to 3,000 characters).');
  const resolved=kind==='auto'?inferInputKind(query):kind;
  // Explicit known aliases such as B12 outrank formula heuristics in auto mode.
  // Choosing formula mode still requests actual formula candidates.
  if(kind==='auto'||resolved==='name'||resolved==='cid') {const local=localMatches(query,catalog,{exact:true});if(local.length)return {kind:resolved==='cid'?'cid':'name',ambiguous:false,results:local.map(c=>({...c,curatedId:c.id,source:'bundled'}))};}
  let ids;
  if(resolved==='cid'){if(!/^\d+$/.test(query)||Number(query)<=0)throw new Error('A PubChem CID must be a positive integer.');ids=[Number(query)];}
  else {
    let path,options={fetcher,signal};
    if(resolved==='formula')path=`/compound/fastformula/${encodeURIComponent(query)}/cids/JSON?MaxRecords=12`;
    else if(resolved==='smiles'){path='/compound/smiles/cids/JSON';options={...options,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({smiles:query}).toString()};}
    else if(resolved==='name')path=`/compound/name/${encodeURIComponent(query)}/cids/JSON`;
    else throw new Error('Unsupported search mode.');
    const data=await jsonRequest(path,options);ids=data.IdentifierList?.CID?.slice(0,12)||[];
  }
  if(!ids.length)throw new Error('No compounds found. Check the input or use an exact PubChem CID.');
  const data=await jsonRequest(`/compound/cid/${ids.join(',')}/property/Title,MolecularFormula,MolecularWeight,IsomericSMILES/JSON`,{fetcher,signal});
  return {kind:resolved,ambiguous:resolved==='formula'||ids.length>1,results:(data.PropertyTable?.Properties||[]).map(p=>{
    const c=catalog.find(c=>[c.cid,c.structureCid,...(c.relatedCids||[])].includes(p.CID));
    return {id:c?.id||`pubchem-${p.CID}`,curatedId:c?.id||null,cid:p.CID,name:p.Title||`PubChem CID ${p.CID}`,formula:p.MolecularFormula,molecularWeight:Number(p.MolecularWeight),smiles:p.SMILES||p.ConnectivitySMILES,source:'PubChem',...(c||{})};
  })};
}
export function parsePubChemRecord(json,{dimension=3,name='PubChem molecule'}={}) {
  const c=json.PC_Compounds?.[0];if(!c?.atoms?.aid)throw new Error('Invalid PubChem atom record.');
  const coordinates=c.coords?.[0],conf=coordinates?.conformers?.[0];
  if(!conf||!conf.x||!conf.y||(dimension===3&&!conf.z))throw new Error('This record has no 3D coordinates. No three-dimensional conformer will be invented.');
  const ids=c.atoms.aid;if(ids.length>1200)throw new Error('This structure is too large for the interactive small-molecule viewer (1,200 atoms).');
  const positions=new Map((coordinates.aid||ids).map((id,i)=>[id,[conf.x[i],conf.y[i],conf.z?.[i]??0]]));
  const charges=new Map((c.atoms.charge||[]).map(x=>[x.aid,x.value]));
  const idMap=new Map(ids.map((id,i)=>[id,i]));
  const atoms=ids.map((id,i)=>{const xyz=positions.get(id);if(!xyz?.every(Number.isFinite))throw new Error('Invalid molecular coordinates.');const element=ELEMENTS[c.atoms.element[i]];if(!element)throw new Error('This PubChem record contains an unspecified atom, dummy atom, or unsupported element code.');return {id:i,sourceAtomId:id,element,x:xyz[0],y:xyz[1],z:xyz[2],charge:charges.get(id)||0};});
  const center=['x','y','z'].map(k=>atoms.reduce((n,a)=>n+a[k],0)/atoms.length);atoms.forEach(a=>{a.x-=center[0];a.y-=center[1];a.z-=center[2];});
  // Code 4 is quadruple, not aromatic. Codes 5–7 and 255 describe special
  // connectivity rather than numerical covalent multiplicities.
  const bonds=(c.bonds?.aid1||[]).map((id,i)=>({a:idMap.get(id),b:idMap.get(c.bonds.aid2[i]),order:c.bonds.order[i]}));
  if(bonds.some(b=>b.a===undefined||b.b===undefined||!BOND_TYPES.has(b.order)))throw new Error('Unsupported or incomplete molecular connectivity.');
  return {name,cid:c.id?.id?.cid,units:dimension===3?'angstrom':'arbitrary 2D diagram units',dimension,atoms,bonds,charge:atoms.reduce((n,a)=>n+a.charge,0),provenance:{url:`https://pubchem.ncbi.nlm.nih.gov/compound/${c.id?.id?.cid}`,method:dimension===3?'PubChem computed 3D conformer':'PubChem 2D connectivity diagram'},notes:dimension===3?'A computed conformer; solution protonation and bound conformation can differ.':'Two-dimensional connectivity only. These coordinates are not a physical 3D molecular conformation.'};
}
export async function fetchStructure(cid,{fetcher=fetch,signal,name}={}) {
  if(!Number.isSafeInteger(Number(cid))||Number(cid)<=0)throw new Error('Invalid compound CID.');
  try{return parsePubChemRecord(await jsonRequest(`/compound/cid/${cid}/record/JSON?record_type=3d`,{fetcher,signal}),{name,dimension:3});}
  catch(error){if(signal?.aborted)throw error;const data=await jsonRequest(`/compound/cid/${cid}/record/JSON?record_type=2d`,{fetcher,signal});return parsePubChemRecord(data,{name,dimension:2});}
}
