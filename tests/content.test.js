import test from 'node:test';
import assert from 'node:assert/strict';
import { modelContent, helpContent, profileContent, targetContent, neuralEvidenceContent, regionalEvidenceContent, interactionEvidenceContent, interactionReferenceContent, sourcesContent, escapeHTML } from '../src/content.js';
import { DIAZEPAM_NEURAL_CALIBRATION } from '../src/neural-evidence.js';
import { modulationFromTargets } from '../src/neural.js';
import { regionalSensitivity, REGIONAL_ATLAS } from '../src/regional-evidence.js';
import { interactionProfileEvidence } from '../src/interaction-evidence.js';
import { ARIPIPRAZOLE_PET_CALIBRATION, PET_VALIDATION_EVIDENCE } from '../src/pet-occupancy.js';

const assay = {
  kind:'activation', midpointNM:5.4, midpointType:'EC50', maxResponse:0.28,
  hillSlope:1, hillEvidence:'assumed', endpoint:'Calcium mobilization',
  system:'Recombinant cells', species:'Human receptor', reference:'serotonin maximum',
  sourceIds:['assay-paper'], notes:'An assay-specific response, not a firing-rate measurement.',
};
const profile = {
  id:'test-compound', name:'Example compound', simulationSupported:true,
  targets:[{target:'HT2A', action:'partial_agonist', kiNM:3.5, efficacy:0.8, affinityLabel:'Ki', evidenceType:'measured binding', functionalAssay:assay}],
  sources:[{id:'assay-paper', title:'Example functional assay', url:'https://example.org/assay'}],
};

test('functional profile distinguishes measured assay parameters from estimated neural mapping', () => {
  const html=profileContent(profile);
  for (const label of ['EC50','5.4 nM','28% of serotonin maximum','Calcium mobilization','Recombinant cells','Human receptor','1 · assumed','Sourced functional assay','Assay-to-brain mapping estimated']) assert.ok(html.includes(label),label);
  assert.ok(html.includes('href="https://example.org/assay"'));
  assert.ok(html.includes('not a universal intrinsic efficacy'));
  assert.ok(!html.includes('Model efficacy coefficient: 0.8'));
});

test('profiles without functional assays and custom assays retain explicit assumption labels', () => {
  const fallback=structuredClone(profile);
  delete fallback.targets[0].functionalAssay;
  assert.match(profileContent(fallback),/Estimated functional response/);
  assert.match(profileContent(fallback),/Model efficacy coefficient: 0.8/);
  assert.match(profileContent({...profile,custom:true}),/User-supplied assay hypothesis/);
  assert.match(profileContent({...profile,sources:[]}),/Unverified assay parameters/);
});

test('sourced midpoint does not imply that the normalized maximum was measured', () => {
  const inhibition=structuredClone(profile);
  Object.assign(inhibition.targets[0].functionalAssay,{kind:'uptake_inhibition',maxResponse:1,maxResponseEvidence:'Estimated complete-inhibition asymptote; no fitted maximum.'});
  const html=profileContent(inhibition);
  assert.match(html,/Maximum-response evidence/);
  assert.match(html,/Estimated complete-inhibition asymptote; no fitted maximum/);
  assert.match(html,/Maximum inhibition/);
});

test('functional provenance fields escape imported text and reject executable source URLs', () => {
  const hostile='<img src=x onerror="alert(1)">';
  const custom=structuredClone(profile);
  for(const field of ['midpointType','maxResponseEvidence','hillEvidence','endpoint','system','species','reference','notes']) custom.targets[0].functionalAssay[field]=hostile;
  custom.sources[0].title=hostile;
  custom.sources[0].url='javascript:alert(1)';
  const html=profileContent(custom);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
});

test('target details display independent assay response, concentration and response provenance', () => {
  const html=targetContent({
    id:'HT2A',kind:'receptor',activity:0.3,baselineActivity:0.2,delta:0.1,
    responseBasis:'Functional response with estimated baseline interpolation',
    occupancyEvidence:'Binding-affinity model',contributors:[],
    functionalResponses:[{id:profile.id,name:profile.name,concentrationNM:5.4,assayResponse:0.14,assay}],
  },{compounds:[profile]});
  for(const label of ['Calculated assay response','14%','Current brain concentration proxy','5.4 nM','Functional response with estimated baseline interpolation','Binding-affinity model','mixture pooling']) assert.ok(html.includes(label),label);
  assert.ok(!html.includes('Efficacy and target-to-network coupling coefficients are illustrative.'));
});

test('target response metadata is text even for imported hostile values', () => {
  const hostile='<svg onload=alert(1)>';
  const html=targetContent({id:'HT2A',responseBasis:hostile,occupancyEvidence:hostile,functionalResponses:[{id:'x',name:hostile,assay:{...assay,reference:hostile}}]});
  assert.ok(!html.includes('<svg'));
  assert.ok(html.includes('&lt;svg onload=alert(1)&gt;'));
});

test('neural evidence separates a measured endpoint from interpolated and capped estimates', () => {
  const render=concentrationNM => neuralEvidenceContent(modulationFromTargets({GABAA:{contributors:[{id:'diazepam',action:'pam',concentrationNM,neuralCalibrationId:DIAZEPAM_NEURAL_CALIBRATION.id}]}}));
  assert.match(render(10),/Measured endpoint · derived τ/);
  assert.match(render(30),/Estimated concentration interpolation/);
  assert.match(render(2000),/Outside measured range · value capped/);
  assert.match(render(10),/transfer to this circuit is estimated/);
  assert.match(render(10),/recordings show smaller diazepam decay changes/);
  assert.match(render(10),/Chronic tolerance is not modeled/);
  assert.match(render(10),/Validation/);
});

test('direct synaptic reference exposes independent mismatches without refitting them', () => {
  const calibrated = structuredClone(profile);
  calibrated.targets[0].neuralCalibrationId = DIAZEPAM_NEURAL_CALIBRATION.id;
  for (const html of [modelContent(), profileContent(calibrated)]) {
    for (const label of ['Independent transfer discrepancies', '112% decay increase', '72.5 ± 12.9% SEM', '49.1% increase derived from group means', 'different preparations and decay endpoints', 'Chronic tolerance is not modeled', 'https://doi.org/10.3389/fncel.2025.1624813', 'https://doi.org/10.3389/fncir.2012.00032']) assert.ok(html.includes(label), label);
  }
});

test('PET profile preserves effect-model parameter provenance separately from functional response', () => {
  const calibrated = structuredClone(profile);
  calibrated.targets[0].occupancyCalibration = structuredClone(ARIPIPRAZOLE_PET_CALIBRATION);
  calibrated.sources.push(...PET_VALIDATION_EVIDENCE.sources);
  const html = profileContent(calibrated);
  for (const label of ['Human PET occupancy model', '8.63 ng/mL', '0.725 h⁻¹', '7.75–9.51 ng/mL', '0.542–0.908 1/h', 'Fixed 100% maximum in the published model', 'N=18 healthy men', 'Parameter confidence intervals are not individual prediction intervals', 'does not measure neuron firing or validate cognition', 'Missing plasma histories', 'Sourced functional assay', 'https://doi.org/10.1038/jcbfm.2011.180']) assert.ok(html.includes(label), label);
  const custom = profileContent({...calibrated,custom:true});
  assert.ok(!custom.includes('Human PET occupancy model'));
});

test('PET target details use current effect state and escape imported provenance', () => {
  const hostile = '<svg onload=alert(1)>';
  const calibration = {...ARIPIPRAZOLE_PET_CALIBRATION,context:hostile,maximumEvidence:hostile};
  const html = targetContent({id:'D2', contributors:[{id:'test-compound',action:'partial_agonist',occupancyCalibration:calibration,effectSiteNgML:12,petSingleCompoundOccupancy:0.6}]}, {compounds:[{...profile,sources:PET_VALIDATION_EVIDENCE.sources}]});
  assert.ok(html.includes('Current effect compartment'));
  assert.ok(html.includes('12 ng/mL'));
  assert.ok(html.includes('Single-compound occupancy estimate'));
  assert.ok(html.includes('60%'));
  assert.ok(!html.includes('<svg'));
  assert.ok(html.includes('&lt;svg onload=alert(1)&gt;'));
});

test('help and model point to the benchmark panel without extending PET validation to firing', () => {
  for (const html of [modelContent(),helpContent()]) {
    assert.match(html, /<strong>Validation<\/strong>/);
    assert.match(html, /PET occupancy (?:comparisons )?do(?:es)? not validate firing or cognition/);
  }
  const html = sourcesContent();
  assert.ok(html.includes('https://doi.org/10.3389/fncel.2025.1624813'));
  assert.ok(html.includes('https://doi.org/10.1371/journal.pone.0046488'));
});

test('legacy experiment migration notice stays visible and treats imported text as untrusted', () => {
  const html=neuralEvidenceContent({},'Old traces retained; <script>alert(1)</script> coefficients changed.');
  assert.match(html,/Imported experiment:/);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('model and calibrated profile retain direct electrophysiology context and uncertainty', () => {
  const calibrated=structuredClone(profile);
  calibrated.targets[0].neuralCalibrationId=DIAZEPAM_NEURAL_CALIBRATION.id;
  for(const html of [modelContent(),profileContent(calibrated)]) {
    for(const point of DIAZEPAM_NEURAL_CALIBRATION.points) assert.ok(html.includes(`${point.durationMs} ± ${point.sdMs} ms`));
    assert.ok(html.includes(DIAZEPAM_NEURAL_CALIBRATION.sourceUrl));
    assert.match(html,/at least 10 minutes/);
    assert.match(html,/Circuit transfer estimated/);
    assert.match(html,/tau = peak-to-25% duration \/ ln\(4\)/);
  }
  assert.match(modelContent(),/Shared denominators are an estimated mixture rule/);
  assert.match(modelContent(),/regional weights and cognitive mappings remain <strong>estimated/);
});

const fallbackWeights = {SERT:0.7,DAT:0.5,NET:0.8,D2:0.5,HT2A:0.8,HT1A:0.7,GABAA:1,NMDA:1,ADENOSINE:0.8,NACHR:0.7};
const evidenceProfile = id => ({id,name:id,metabolism:{interactionEvidenceId:id}});

test('regional inspector distinguishes original PET measurements, derived weights and unsupported targets', () => {
  const regionalEvidence = regionalSensitivity('dlpfc_l',fallbackWeights);
  const html = regionalEvidenceContent({name:'Left dorsolateral prefrontal cortex',receptorDensities:regionalEvidence.weights,regionalEvidence});
  for(const label of ['5 of 10 target weights use PET references','PET-derived relative proxy','Estimated fallback','Atlas reference parcel mean','Measured parameter','PET tracer','Source participants','Normalization · estimated','Reference mean','Reference parcels','Mapping assumption','dimensionless transformations','Population response remains estimated','CC-BY-NC-SA-4.0']) {
    assert.ok(html.includes(label),label);
  }
  assert.ok(!html.includes('[object Object]'));
  assert.ok(html.includes(regionalEvidence.evidenceByTarget.HT2A.sourceUrl));
  assert.ok(html.includes('mean(mapped parcel values) / mean(reference parcel values)'));
  assert.ok(html.includes('No matching adenosine receptor atlas'));
});

test('unresolved anatomical territories clearly retain all estimated regional weights', () => {
  const regionalEvidence = regionalSensitivity('md_thalamus_l',fallbackWeights);
  const html=regionalEvidenceContent({name:'Mediodorsal thalamus',receptorDensities:regionalEvidence.weights,regionalEvidence});
  assert.match(html,/0 of 10 target weights use PET references/);
  assert.match(html,/does not isolate the mediodorsal nucleus/);
  assert.equal((html.match(/Estimated fallback/g)||[]).length,10);
  assert.ok(!html.includes('PET-derived relative proxy'));
});

test('regional evidence and source links render untrusted provenance as text', () => {
  const regionalEvidence=structuredClone(regionalSensitivity('dlpfc_l',fallbackWeights));
  const hostile='<svg onload="alert(1)">';
  for(const item of Object.values(regionalEvidence.evidenceByTarget)) {
    Object.assign(item,{sourceTitle:hostile,sourceUrl:'javascript:alert(1)',dataUrl:'data:text/html,bad',mappingNote:hostile,limitations:[hostile],normalization:{formula:hostile,reference:hostile}});
  }
  const html=regionalEvidenceContent({name:hostile,regionalEvidence});
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('href="data:'));
  assert.ok(html.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'));
});

test('metabolic cards expose nominal Ki, binding correction, derived clearance and omitted metabolites separately', () => {
  const inhibitor=interactionProfileEvidence(evidenceProfile('fluoxetine'));
  const substrate=interactionProfileEvidence(evidenceProfile('aripiprazole'));
  const html=interactionEvidenceContent({substrateId:'aripiprazole',inhibitorIds:['fluoxetine'],enzyme:'CYP2D6',modeled:true,clearanceFactor:0.75,
    assays:inhibitor.inhibitionAssays,clearanceModel:substrate.clearanceModels[0],sources:[...inhibitor.sources,...substrate.sources]});
  for(const label of ['ASSAY-INFORMED ESTIMATE','75%','Measured nominal inhibition Ki','860 nM','68 nM','Derived unbound Ki','412.8 nM','35.36 nM','Binding-correction evidence','Parent-mixture evidence','Clearance fraction derived under assumptions','2.12 ×','complete pathway inhibition','Active metabolites']) assert.ok(html.includes(label),label);
  assert.ok(!html.includes('OBSERVED HUMAN STUDY'));
  assert.ok(!html.includes('predicted AUC'));
});

test('unmodeled and partially covered mixtures never imply zero effect or complete coverage', () => {
  const absent=interactionEvidenceContent({enzyme:'CYP2D6',substrateId:'unknown',inhibitorIds:['x'],modeled:false,clearanceFactor:null});
  assert.match(absent,/QUANTITATIVE EFFECT UNMODELED/);
  assert.match(absent,/missing parameters do not mean no interaction/);
  assert.ok(!absent.includes('0%'));
  assert.ok(!absent.includes('100%'));
  const partial=interactionEvidenceContent({enzyme:'CYP2D6',substrateId:'unknown',inhibitorIds:['known','custom'],modeled:true,clearanceFactor:0.9,partial:true,unmodeledInhibitorIds:['custom']});
  assert.match(partial,/Incomplete mixture:/);
  assert.match(partial,/factor excludes those contributions/);
});

test('human-study comparator preserves protocol, participants and separation from virtual exposure', () => {
  const reference=interactionProfileEvidence(evidenceProfile('bupropion')).clinicalReferences[0];
  const html=interactionReferenceContent(reference);
  for(const label of ['OBSERVED HUMAN STUDY','Approximately fivefold AUC','150 mg twice daily','15 male CYP2D6 extensive metabolizers','small parent-only calculated effect','omitted metabolites']) assert.ok(html.includes(label),label);
  assert.ok(!html.includes('Modeled total clearance'));
  assert.ok(html.includes(escapeHTML(reference.sources[0].url)));
});

test('interaction evidence blocks executable URLs and escapes nested imported text', () => {
  const hostile='<img src=x onerror=alert(1)>';
  const html=interactionEvidenceContent({substrateId:hostile,inhibitorIds:[hostile],enzyme:hostile,evidence:hostile,modeled:true,clearanceFactor:0.9,partial:true,unmodeledInhibitorIds:[hostile],
    assays:[{compoundId:hostile,enzyme:hostile,system:hostile,species:hostile,components:[{label:hostile,kiNM:1,bindingEvidence:hostile,fractionEvidence:hostile}],assumptions:[hostile],sourceIds:['bad']}],sources:[{id:'bad',title:hostile,url:'javascript:alert(1)'}]});
  const reference=interactionReferenceContent({title:hostile,endpoint:hostile,result:hostile,regimen:hostile,population:hostile,applicability:hostile,sourceIds:['bad'],sources:[{id:'bad',title:hostile,url:'javascript:alert(1)'}]});
  for(const rendered of [html,reference]) {
    assert.ok(!rendered.includes('<img'));
    assert.ok(!rendered.includes('href="javascript:'));
    assert.ok(rendered.includes('&lt;img src=x onerror=alert(1)&gt;'));
  }
});

test('custom profiles cannot acquire measured metabolic evidence by copying a curated identifier', () => {
  const html=profileContent({...evidenceProfile('bupropion'),custom:true});
  assert.match(html,/unverified hypotheses/);
  assert.ok(!html.includes('12650 nM'));
  assert.ok(!html.includes('OBSERVED HUMAN STUDY'));
  const measured=profileContent(evidenceProfile('bupropion'));
  assert.match(measured,/12650 nM/);
  assert.match(measured,/Parent-only inhibition can severely underrepresent/);
});

test('source directory attributes regional data license and metabolic studies', () => {
  const html=sourcesContent({compounds:[evidenceProfile('bupropion')]});
  assert.ok(html.includes(REGIONAL_ATLAS.citationUrl));
  assert.ok(html.includes(REGIONAL_ATLAS.licenseUrl));
  assert.match(html,/Tanaudommongkon/);
  assert.match(html,/observed study outcomes from the current calculation/);
});

test('legacy imported metabolic coefficients cannot appear as assay-informed evidence', () => {
  const html=interactionEvidenceContent({enzyme:'CYP2D6',substrateId:'old',inhibitorIds:['old-inhibitor'],modeled:true,clearanceFactor:0.5,evidenceType:'legacy estimate',evidence:'Replay uses the legacy assumed potency.'});
  assert.match(html,/LEGACY ESTIMATED CLEARANCE/);
  assert.match(html,/Replay uses the legacy assumed potency/);
  assert.ok(!html.includes('ASSAY-INFORMED ESTIMATE'));
});
