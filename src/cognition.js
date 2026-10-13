/** A transparent symbolic workspace coupled to regional activity.
 * It implements attention, recency-weighted retrieval and stochastic selection;
 * these are inspectable computational rules, not human thoughts or a theory of
 * consciousness. Parameter mappings are unvalidated research hypotheses.
 */
export const COGNITIVE_DT_SECONDS = 0.05;
export const COGNITIVE_CYCLE_SECONDS = 2;
export const COGNITIVE_LIMITS = Object.freeze({ memories:64, events:200, messages:80, text:3000, candidateExcerpt:160, contextSnapshot:24000 });
const clamp = (x,lo=0,hi=1) => Math.min(hi,Math.max(lo,x));
const clone = value => structuredClone(value);
const finite = (x,label,lo=0,hi=Infinity) => {if(!Number.isFinite(x)||x<lo||x>hi)throw new RangeError(`Invalid ${label}`);return x;};
const text = (value,label,max=COGNITIVE_LIMITS.text) => {if(typeof value!=='string'||!value.trim()||value.length>max)throw new TypeError(`Invalid ${label}`);return value.trim();};
// Copy only the small provenance contract returned by DialogueClient. In
// particular, never retain its complete prompt, memories, events or history.
function contextSnapshot(value) {
  const record = (item, keys, label) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || ![Object.prototype, null].includes(Object.getPrototypeOf(item)) || Reflect.ownKeys(item).some(key => typeof key !== 'string' || !keys.includes(key))) throw new TypeError(`Invalid ${label}`);
    return item;
  };
  const boundedString = (item, label, max) => { if (typeof item !== 'string' || item.length > max) throw new TypeError(`Invalid ${label}`); return item; };
  const list = (item, label, max) => { if (!Array.isArray(item) || item.length > max) throw new TypeError(`Invalid ${label}`); return Array.from(item); };
  const numbers = (item, keys, label, max = Infinity) => {
    record(item, keys, label);
    return Object.fromEntries(Object.entries(item).map(([key, number]) => [key, finite(number, `${label} ${key}`, 0, max)]));
  };
  record(value, ['clocks', 'metrics', 'focus', 'exposures', 'qualitative', 'modelSampling'], 'response context');
  const result = {
    clocks: numbers(value.clocks, ['playbackSeconds', 'systemicHours', 'neuralMs'], 'context clock'),
    metrics: numbers(value.metrics, ['attention', 'retention', 'flexibility', 'inhibition'], 'context metric', 1),
    focus: value.focus === null ? null : boundedString(value.focus, 'context focus', 240),
    exposures: list(value.exposures, 'context exposures', 8).map(exposure => {
      record(exposure, ['id', 'name', 'brainNM', 'targets'], 'context exposure');
      return {
        id: boundedString(exposure.id, 'context compound identity', 80),
        name: boundedString(exposure.name, 'context compound name', 100),
        brainNM: exposure.brainNM === null ? null : finite(exposure.brainNM, 'context brain concentration'),
        targets: list(exposure.targets, 'context targets', 10).map(target => {
          record(target, ['target', 'action', 'kiNM', 'efficacy'], 'context target');
          const result = { target: boundedString(target.target, 'context target name', 60) };
          if (Object.hasOwn(target, 'action')) result.action = boundedString(target.action, 'context target action', 60);
          if (Object.hasOwn(target, 'kiNM')) { result.kiNM = finite(target.kiNM, 'context affinity'); if (result.kiNM === 0) throw new RangeError('Invalid context affinity'); }
          if (Object.hasOwn(target, 'efficacy')) result.efficacy = finite(target.efficacy, 'context efficacy', 0, 1);
          return result;
        }),
      };
    }),
    qualitative: list(value.qualitative, 'context qualitative pathways', 8).map(pathway => {
      record(pathway, ['name', 'interpretation'], 'context qualitative pathway');
      return { name: boundedString(pathway.name, 'context pathway name', 100), interpretation: boundedString(pathway.interpretation, 'context pathway interpretation', 240) };
    }),
  };
  const sampling = record(value.modelSampling, ['temperature', 'flexibility', 'rule'], 'context sampling');
  result.modelSampling = {
    temperature: finite(sampling.temperature, 'context temperature', .001, 10),
    flexibility: sampling.flexibility === null ? null : finite(sampling.flexibility, 'context flexibility', 0, 1),
    rule: boundedString(sampling.rule, 'context sampling rule', 300),
  };
  if (JSON.stringify(result).length > COGNITIVE_LIMITS.contextSnapshot) throw new RangeError('Invalid response context size');
  return result;
}
const SEEDS = ['sequence and change','memory and continuity','rules and exceptions','cause and uncertainty','comparison and difference','plans and alternatives','patterns and relationships','language and meaning'];
const STOP = new Set('a an the and or to of in is are am i you me my your that it this what how why can do does please'.split(' '));
export function tokens(value){return [...new Set((String(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>1&&!STOP.has(t)))].slice(0,80);}
export function similarity(a,b){const left=new Set(tokens(a)),right=new Set(tokens(b));if(!left.size||!right.size)return 0;let intersection=0;for(const t of left)if(right.has(t))intersection++;return intersection/Math.sqrt(left.size*right.size);}
export function softmax(weights,temperature=1){finite(temperature,'selection temperature',.001,10);if(!weights.length)return [];weights.forEach(w=>finite(w,'selection score',-1e4,1e4));const max=Math.max(...weights),terms=weights.map(w=>Math.exp((w-max)/temperature)),sum=terms.reduce((a,b)=>a+b,0);return terms.map(w=>w/sum);}
function derivedMetrics(brain){const regions=brain?.regional||[];const delta=prefixes=>{const rs=regions.filter(r=>prefixes.some(p=>r.id.startsWith(p)));return rs.length?rs.reduce((v,r)=>v+(r.e-r.baselineE),0)/rs.length:0;};const pfc=delta(['dlpfc']),hip=delta(['hippocampus']),association=delta(['pcc','precuneus','temporal','ipl']),acc=delta(['acc']),striatal=delta(['striatum']);return {attention:clamp(.72+1.2*pfc+.4*acc,.1,.98),retention:clamp(.85+hip+.35*pfc,.1,.99),flexibility:clamp(.42+1.3*association-.35*pfc+.25*striatal,.05,.95),inhibition:clamp(.65+.6*acc-.5*association,.1,.98)};}
export class CognitiveWorkspace {
  constructor({seed=42}={}){this.seed=seed>>>0;this.reset();}
  reset(){this.ticks=0;this.timeSeconds=0;this.accumulator=0;this.randomState=this.seed||1;this.autonomous=true;this.focus='sequence and change';this.metrics=derivedMetrics();this.memories=SEEDS.map((content,i)=>({id:i,content,kind:'seed concept',strength:.65,createdAt:0,lastRetrieved:0}));this.nextMemoryId=this.memories.length;this.workingMemory=[];this.events=[];this.messages=[];this.nextEventId=0;this.nextMessageId=0;this.cycles=0;this.droppedEvents=0;this._event('initialized','Workspace initialized with abstract concepts.',{sensoryInputs:false,rule:'No environmental, visual, auditory, touch, smell, or taste inputs.'});return this;}
  _random(){let x=this.randomState;x^=x<<13;x^=x>>>17;x^=x<<5;this.randomState=x>>>0;return this.randomState/4294967296;}
  _event(kind,summary,detail={}){this.events.push({id:this.nextEventId++,timeSeconds:this.timeSeconds,kind,summary,detail:clone(detail)});while(this.events.length>COGNITIVE_LIMITS.events){this.events.shift();this.droppedEvents++;}}
  _message(role,content,extra={}){const item={id:this.nextMessageId++,timeSeconds:this.timeSeconds,role,content,...clone(extra)};this.messages.push(item);if(this.messages.length>COGNITIVE_LIMITS.messages)this.messages.shift();return clone(item);}
  receive(input){const question=text(input,'symbolic input');const message=this._message('user',question,{mode:'symbolic input'});this.focus=question.slice(0,240);const isInstruction=/^remember\b/i.test(question);const content=isInstruction?question.replace(/^remember(?:\s+that)?\s*[:,-]?\s*/i,'').trim()||question:question;const duplicate=this.memories.find(m=>m.content.toLowerCase()===content.toLowerCase());if(duplicate){duplicate.strength=1;duplicate.lastRetrieved=this.timeSeconds;}else{this.memories.push({id:this.nextMemoryId++,content,kind:isInstruction?'user statement':'user question',strength:1,createdAt:this.timeSeconds,lastRetrieved:this.timeSeconds});if(this.memories.length>COGNITIVE_LIMITS.memories){const disposable=[...this.memories].sort((a,b)=>a.strength-b.strength||a.createdAt-b.createdAt)[0];this.memories=this.memories.filter(m=>m.id!==disposable.id);}}
    this._event('symbolic input','Text was written directly into the workspace.',{input:question,route:'Direct symbolic channel; no biological sensory decoding.',memoryKind:isInstruction?'user statement, not verified fact':'question'});this._retrieve();return message;}
  recordResponse(response){if(!response||!['local-llm','state-inspector'].includes(response.mode))throw new TypeError('Unknown response mode');const answer=text(response.text,'response',12000);const provenance=response.contextSnapshot===undefined?{}:{contextSnapshot:contextSnapshot(response.contextSnapshot)};const message=this._message('assistant',answer,{mode:response.mode,modelId:String(response.modelId||'').slice(0,200),contextSummary:String(response.contextSummary||'').slice(0,1500),...provenance});this._event('response','A separate language interface produced a response.',{messageId:message.id,mode:response.mode,modelId:message.modelId,contextSummary:message.contextSummary,provenance:'Response text is not the regional network’s hidden reasoning.'});return message;}
  _retrieve(){const ranked=this.memories.map(m=>({memoryId:m.id,content:m.content,kind:m.kind,score:.7*similarity(this.focus,m.content)+.25*m.strength+.05*Math.exp(-(this.timeSeconds-m.lastRetrieved)/30)})).sort((a,b)=>b.score-a.score||a.memoryId-b.memoryId);this.workingMemory=ranked.slice(0,Math.max(2,Math.round(2+this.metrics.attention*4)));return ranked;}
  _cycle(){this.cycles++;const candidates=this._retrieve().slice(0,8);if(!candidates.length)return;const temperature=.12+.65*this.metrics.flexibility;const scores=candidates.map(c=>c.score-(c.content===this.focus?.12*this.metrics.flexibility:0));const probabilities=softmax(scores,temperature);const sample=this._random();let total=0,chosen=candidates.at(-1);for(let i=0;i<candidates.length;i++){total+=probabilities[i];if(sample<total){chosen=candidates[i];break;}}this.focus=chosen.content.slice(0,240);const memory=this.memories.find(m=>m.id===chosen.memoryId);if(memory){memory.strength=clamp(memory.strength+.04*this.metrics.retention);memory.lastRetrieved=this.timeSeconds;}
    this._event('workspace selection','An association entered the modeled focus.',{focus:this.focus,rule:'Softmax selection over lexical similarity, memory strength and recency.',temperature,candidates:candidates.map((c,i)=>({memoryId:c.memoryId,excerpt:c.content.slice(0,COGNITIVE_LIMITS.candidateExcerpt),score:scores[i],probability:probabilities[i]})),metrics:clone(this.metrics),interpretation:'An explicit algorithmic state transition, not a report of subjective thought.'});}
  advance(seconds,brainStats){finite(seconds,'workspace duration');this.accumulator+=seconds;const count=Math.floor((this.accumulator+1e-10)/COGNITIVE_DT_SECONDS);this.accumulator-=count*COGNITIVE_DT_SECONDS;if(Math.abs(this.accumulator)<1e-10)this.accumulator=0;for(let i=0;i<count;i++){this.metrics=derivedMetrics(brainStats);this.timeSeconds=++this.ticks*COGNITIVE_DT_SECONDS;const decay=Math.exp(-COGNITIVE_DT_SECONDS*(1-this.metrics.retention)/120);for(const m of this.memories)m.strength*=decay;if(this.autonomous&&this.ticks%Math.round(COGNITIVE_CYCLE_SECONDS/COGNITIVE_DT_SECONDS)===0)this._cycle();}return count;}
  get drives(){const hasUser=this.messages.length>0;const phase=Math.floor(this.timeSeconds/COGNITIVE_CYCLE_SECONDS)%3;return {dlpfc_l:hasUser?.25*this.metrics.attention:.04,dlpfc_r:hasUser?.22*this.metrics.attention:.04,ifg_l:hasUser?.16:0,temporal_l:hasUser?.12:0,hippocampus_l:this.autonomous&&phase===1?.15*this.metrics.retention:.03,hippocampus_r:this.autonomous&&phase===1?.12*this.metrics.retention:.03,pcc_l:this.autonomous&&phase===2?.1*this.metrics.flexibility:0,pcc_r:this.autonomous&&phase===2?.1*this.metrics.flexibility:0};}
  get stats(){return clone({timeSeconds:this.timeSeconds,focus:this.focus,workingMemory:this.workingMemory,metrics:this.metrics,memories:this.memories,events:this.events,messages:this.messages,autonomous:this.autonomous,cycles:this.cycles,totalEvents:this.nextEventId,droppedEvents:this.droppedEvents,sensoryInputs:false,interpretation:'Symbolic workspace metrics and neural coupling are assumptions, not validated measures of human cognition or consciousness.'});}
  snapshot(){return clone({version:1,seed:this.seed,ticks:this.ticks,timeSeconds:this.timeSeconds,accumulator:this.accumulator,randomState:this.randomState,autonomous:this.autonomous,focus:this.focus,metrics:this.metrics,memories:this.memories,nextMemoryId:this.nextMemoryId,workingMemory:this.workingMemory,events:this.events,messages:this.messages,nextEventId:this.nextEventId,nextMessageId:this.nextMessageId,cycles:this.cycles,droppedEvents:this.droppedEvents});}
  restore(snapshot){const s=clone(snapshot);if(!s||s.version!==1)throw new TypeError('Unsupported cognitive checkpoint');for(const key of ['ticks','randomState','seed','nextMemoryId','nextEventId','nextMessageId','cycles','droppedEvents']){finite(s[key],key,0,Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(s[key]))throw new TypeError(`Invalid ${key}`);}if(s.randomState>0xffffffff||s.seed>0xffffffff)throw new RangeError('Invalid random state');finite(s.timeSeconds,'workspace clock');if(Math.abs(s.timeSeconds-s.ticks*COGNITIVE_DT_SECONDS)>1e-8)throw new RangeError('Workspace clock mismatch');finite(s.accumulator,'workspace remainder',0,COGNITIVE_DT_SECONDS);if(s.accumulator>=COGNITIVE_DT_SECONDS)throw new RangeError('Invalid remainder');if(typeof s.autonomous!=='boolean')throw new TypeError('Invalid autonomy switch');text(s.focus,'focus',240);for(const key of ['attention','retention','flexibility','inhibition'])finite(s.metrics?.[key],`metric ${key}`,0,1);
    for(const [key,cap]of [['memories',64],['workingMemory',6],['events',200],['messages',80]])if(!Array.isArray(s[key])||s[key].length>cap)throw new TypeError(`Invalid ${key}`);
    const ids=new Set();for(const m of s.memories){if(!Number.isSafeInteger(m.id)||m.id<0||ids.has(m.id)||m.id>=s.nextMemoryId)throw new TypeError('Invalid memory identity');ids.add(m.id);text(m.content,'memory');text(m.kind,'memory kind',40);finite(m.strength,'memory strength',0,1);finite(m.createdAt,'memory creation',0,s.timeSeconds+1e-8);finite(m.lastRetrieved,'memory retrieval',0,s.timeSeconds+1e-8);}for(const w of s.workingMemory){if(!ids.has(w.memoryId))throw new TypeError('Working memory refers to missing memory');text(w.content,'working memory');finite(w.score,'retrieval score',0,2);}
    const validateLog=(items,nextId,kind)=>{let previous=-1;for(const item of items){if(!Number.isSafeInteger(item.id)||item.id<=previous||item.id>=nextId)throw new TypeError(`Invalid ${kind} identity`);previous=item.id;finite(item.timeSeconds,`${kind} time`,0,s.timeSeconds+1e-8);if(kind==='message'){if(!['user','assistant'].includes(item.role))throw new TypeError('Invalid message role');text(item.content,'message',12000);if(item.role==='assistant'&&!['state-inspector','local-llm'].includes(item.mode))throw new TypeError('Invalid message provenance');if(item.contextSnapshot!==undefined){if(item.role!=='assistant')throw new TypeError('Invalid response context role');item.contextSnapshot=contextSnapshot(item.contextSnapshot);}}else{text(item.kind,'event kind',60);text(item.summary,'event summary',500);if(!item.detail||typeof item.detail!=='object'||JSON.stringify(item.detail).length>20000)throw new TypeError('Invalid event detail');}}};validateLog(s.messages,s.nextMessageId,'message');validateLog(s.events,s.nextEventId,'event');for(const key of ['seed','ticks','timeSeconds','accumulator','randomState','autonomous','focus','metrics','memories','nextMemoryId','workingMemory','events','messages','nextEventId','nextMessageId','cycles','droppedEvents'])this[key]=s[key];return this;}
  /** Old experiments did not have a workspace. Preserve their elapsed clock
   * without inventing prior thoughts, messages, memory retrievals or events. */
  initializeAt(timeSeconds){finite(timeSeconds,'initial workspace time');this.reset();this.ticks=Math.round(timeSeconds/COGNITIVE_DT_SECONDS);this.timeSeconds=this.ticks*COGNITIVE_DT_SECONDS;this.events=[];this.nextEventId=0;this._event('imported','Workspace initialized at an older experiment checkpoint.',{priorCognition:'not recorded'});return this;}
}
