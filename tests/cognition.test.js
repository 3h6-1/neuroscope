import test from 'node:test';
import assert from 'node:assert/strict';
import {CognitiveWorkspace,COGNITIVE_LIMITS,softmax,similarity} from '../src/cognition.js';
import {DialogueClient} from '../src/dialogue.js';
test('symbolic input stores attributable statements and retrieves relevant memory without sensory routes',()=>{const w=new CognitiveWorkspace();w.receive('Remember that the project name is Atlas');w.receive('What is the project name?');assert.ok(w.workingMemory.some(m=>m.content==='the project name is Atlas'));assert.equal(w.stats.sensoryInputs,false);assert.equal(w.messages[0].role,'user');assert.ok(w.memories.some(m=>m.kind==='user statement'));assert.ok(similarity('project name','the project name is Atlas')>similarity('project name','geometric shapes'));});
test('softmax remains normalized for large finite scores and reacts to selection temperature',()=>{assert.ok(Math.abs(softmax([9999,9998]).reduce((s,x)=>s+x,0)-1)<1e-12);assert.ok(softmax([1,0],.1)[0]>softmax([1,0],1)[0]);assert.throws(()=>softmax([NaN]),/Invalid/);});
test('autonomous workspace is a seeded observable algorithm and is frame-partition invariant',()=>{const a=new CognitiveWorkspace(),b=new CognitiveWorkspace();a.advance(8);for(let i=0;i<800;i++)b.advance(.01);assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(a.cycles,4);assert.ok(a.events.some(e=>e.kind==='workspace selection'&&e.detail.candidates.length>0));});
test('regional changes affect explicit bounded cognitive hypotheses without drug-name shortcuts',()=>{const a=new CognitiveWorkspace(),b=new CognitiveWorkspace();a.advance(2,{regional:[{id:'dlpfc_l',e:.5,baselineE:.5},{id:'hippocampus_l',e:.5,baselineE:.5}]});b.advance(2,{regional:[{id:'dlpfc_l',e:.1,baselineE:.5},{id:'hippocampus_l',e:.1,baselineE:.5}]});assert.ok(b.metrics.attention<a.metrics.attention);assert.ok(b.metrics.retention<a.metrics.retention);for(const v of Object.values(b.metrics))assert.ok(v>=0&&v<=1);});
test('pause of autonomous selection leaves direct text communication available',()=>{const w=new CognitiveWorkspace();w.autonomous=false;w.advance(10);assert.equal(w.cycles,0);w.receive('Remember a triangle has three sides');assert.equal(w.messages.length,1);assert.ok(w.drives.ifg_l>0);});
test('response provenance and JSON checkpoints preserve replay without regenerating language',()=>{const w=new CognitiveWorkspace();w.receive('What is memory?');w.recordResponse({text:'An explicitly generated answer.',mode:'local-llm',modelId:'test',contextSummary:'Snapshot at zero.'});w.advance(5);const restored=new CognitiveWorkspace().restore(JSON.parse(JSON.stringify(w.snapshot())));restored.advance(4);w.advance(4);assert.deepEqual(restored.snapshot(),w.snapshot());assert.equal(restored.messages[1].mode,'local-llm');});
test('malformed cognitive imports reject atomically and retained journals disclose truncation',()=>{const w=new CognitiveWorkspace();w.advance(410);assert.equal(w.events.length,200);assert.ok(w.droppedEvents>0);const before=w.snapshot(),bad=w.snapshot();bad.memories[0].strength=Infinity;assert.throws(()=>w.restore(bad),/Invalid/);assert.deepEqual(w.snapshot(),before);assert.throws(()=>w.receive(''),/Invalid/);assert.throws(()=>w.recordResponse({text:'x',mode:'human'}),/Unknown/);});
test('older checkpoints initialize a workspace without invented earlier dialogue',()=>{const w=new CognitiveWorkspace().initializeAt(12.5);assert.equal(w.timeSeconds,12.5);assert.equal(w.messages.length,0);assert.equal(w.cycles,0);assert.match(w.events[0].detail.priorCognition,/not recorded/);assert.doesNotThrow(()=>new CognitiveWorkspace().restore(w.snapshot()));});

test('eight long memories remain replayable after 120 seconds with compact selection evidence',()=>{
  const w=new CognitiveWorkspace({seed:123});
  for(let i=0;i<8;i++)w.receive(`Remember ${i} ${'memory sequence '.repeat(220)}`.slice(0,2990));
  w.advance(120);
  const selections=w.events.filter(e=>e.kind==='workspace selection');
  assert.equal(selections.length,60);
  const memories=new Map(w.memories.map(m=>[m.id,m.content]));
  assert.equal([...memories.values()].filter(content=>content.length>2900).length,8);
  for(const {detail} of selections){
    assert.equal(detail.candidates.length,8);
    assert.ok(JSON.stringify(detail).length<3500,'event must not repeat complete long memories');
    assert.ok(Math.abs(detail.candidates.reduce((sum,c)=>sum+c.probability,0)-1)<1e-12);
    for(const candidate of detail.candidates){
      assert.equal(candidate.content,undefined);
      assert.ok(candidate.excerpt.length<=COGNITIVE_LIMITS.candidateExcerpt);
      assert.equal(candidate.excerpt,memories.get(candidate.memoryId).slice(0,160));
      assert.ok(Number.isFinite(candidate.score));
      assert.ok(candidate.probability>=0&&candidate.probability<=1);
    }
  }
  const serialized=JSON.stringify(w.snapshot());
  assert.ok(serialized.length<300000,'checkpoint growth must be bounded independently of repeated candidate text');
  const restored=new CognitiveWorkspace().restore(JSON.parse(serialized));
  assert.deepEqual(restored.snapshot(),w.snapshot());
  restored.advance(6);w.advance(6);
  assert.deepEqual(restored.snapshot(),w.snapshot());
});

test('real DialogueClient provenance survives recording, JSON restore and deterministic replay',async()=>{
  const w=new CognitiveWorkspace();w.receive('What is the current state?');
  const context={
    clocks:{playbackSeconds:0,systemicHours:1.5,neuralMs:125},
    workspace:w.stats,
    exposures:[{id:'escitalopram',name:'Escitalopram',brainNM:5,targets:[{target:'SERT',action:'inhibitor',kiNM:1.1,efficacy:0}]}],
    qualitative:[{name:'Vitamin B12'}],
  };
  const response=await new DialogueClient().respond({question:'What is the current state?',context});
  const message=w.recordResponse(response);
  assert.deepEqual(message.contextSnapshot,response.contextSnapshot);
  assert.equal(message.contextSnapshot.workingMemory,undefined);
  assert.equal(message.contextSnapshot.memories,undefined);
  assert.equal(w.events.at(-1).detail.messageId,message.id);
  assert.equal(w.events.at(-1).detail.contextSnapshot,undefined,'keep one provenance copy per answer');
  response.contextSnapshot.clocks.neuralMs=999;
  message.contextSnapshot.metrics.attention=0;
  assert.equal(w.messages.at(-1).contextSnapshot.clocks.neuralMs,125);
  assert.equal(w.messages.at(-1).contextSnapshot.metrics.attention,.72);
  const restored=new CognitiveWorkspace().restore(JSON.parse(JSON.stringify(w.snapshot())));
  assert.deepEqual(restored.messages,w.messages);
  restored.advance(4);w.advance(4);
  assert.deepEqual(restored.snapshot(),w.snapshot());
});

test('response provenance rejects unbounded or unsafe fields atomically on record and restore',async()=>{
  const response=await new DialogueClient().respond({question:'state',context:{workspace:{focus:'A concept',metrics:{flexibility:.42}},clocks:{playbackSeconds:0},exposures:[{id:'sample',name:'Sample',brainNM:2,targets:[{target:'SERT',action:'inhibitor',kiNM:2}]}]}});
  const invalid=[
    value=>{value.history=['unbounded prompt contents'];},
    value=>{value.clocks.playbackSeconds=Infinity;},
    value=>{value.metrics.flexibility='0.42';},
    value=>{value.metrics.unknown=.5;},
    value=>{value.focus='x'.repeat(241);},
    value=>{value.exposures=Array(9).fill(value.exposures[0]);},
    value=>{value.exposures=Array(1);},
    value=>{value.exposures[0].brainNM=-1;},
    value=>{value.exposures[0].targets[0].kiNM=0;},
    value=>{value.exposures[0].targets[0].action={nested:'payload'};},
    value=>{value.modelSampling.temperature=NaN;},
    value=>{Object.defineProperty(value,'__proto__',{value:{polluted:true},enumerable:true});},
  ];
  const w=new CognitiveWorkspace();w.recordResponse(response);
  const before=w.snapshot();
  for(const mutate of invalid){
    const badResponse=structuredClone(response);mutate(badResponse.contextSnapshot);
    assert.throws(()=>w.recordResponse(badResponse),/Invalid/);
    assert.deepEqual(w.snapshot(),before);
    const badCheckpoint=structuredClone(before);mutate(badCheckpoint.messages[0].contextSnapshot);
    assert.throws(()=>w.restore(badCheckpoint),/Invalid/);
    assert.deepEqual(w.snapshot(),before);
  }
});
