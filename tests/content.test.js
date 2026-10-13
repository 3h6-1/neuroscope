import test from 'node:test';
import assert from 'node:assert/strict';
import { modelContent, profileContent, targetContent, neuralEvidenceContent } from '../src/content.js';
import { DIAZEPAM_NEURAL_CALIBRATION } from '../src/neural-evidence.js';
import { modulationFromTargets } from '../src/neural.js';

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
