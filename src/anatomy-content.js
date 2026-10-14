import { ANATOMY_STRUCTURES, ANATOMY_SOURCES, ANATOMY_SCOPE, ENDOCRINE_PATHWAYS } from './anatomy-data.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const list = value => Array.isArray(value) ? value : [];

/** Preserve the distinction between a picked nerve root, MRI cortex and landmark. */
export function anatomyInspection(data) {
  const structure=ANATOMY_STRUCTURES.find(item=>item.id===data.anatomyId);
  if(!structure)return {...data};
  if(data.peripheralContext)return {...data,label:'Spinal nerve root · peripheral context',detail:'Peripheral nervous system reference beside the cord. No nerve physiology is simulated.'};
  if(data.type==='brain-surface')return {...data,detail:data.source==='procedural fallback'?'Procedural fallback surface; no MRI reconstruction is supplied.':'MRI-derived fsaverage5 cortical surface; internal structures remain schematic.'};
  if(data.type==='cns-anatomy')return {...data,detail:'Torso-scale CNS context; displayed shape and course are approximate.'};
  return {...data,label:structure.name,description:structure.role,detail:structure.id==='cerebrum'?'MRI-derived outer cortical surface; internal tissue is not segmented.':'Schematic anatomy · shape and placement are approximate.'};
}

function sourceLink(source) {
  const title = escape(source?.title || source?.id || 'Anatomy reference');
  try {
    const url = new URL(String(source?.url));
    if (['https:', 'http:'].includes(url.protocol)) return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${title} ↗</a>`;
  } catch { /* Unsupported URLs remain plain, escaped text. */ }
  return title;
}

function references(ids, sources) {
  const selected = [...new Set(list(ids))].map(id => list(sources).find(source => source.id === id)).filter(Boolean);
  return selected.length ? `<p class="anatomy-sources">${selected.map(sourceLink).join(' · ')}</p>` : '';
}

function focusButton(structure) {
  return `<button type="button" class="anatomy-locate" data-anatomy-focus="${escape(structure.id)}">Locate ${escape(structure.name)} in 3D</button>`;
}

function scopeContent(scope, sources) {
  return `<section class="anatomy-scope"><h3>Central nervous system and endocrine organs</h3>
${scope?.centralNervousSystem ? `<p>${escape(scope.centralNervousSystem)}</p>` : ''}
${scope?.associatedEndocrine ? `<p>${escape(scope.associatedEndocrine)}</p>` : ''}
${references(scope?.sourceIds, sources)}
<div class="callout"><p><strong>${escape(scope?.classification || 'Schematic anatomy teaching layer')}</strong></p>
<p>${escape(scope?.geometry || 'These shapes illustrate relative locations; they are not patient-specific anatomy or segmented internal MRI structures.')}</p>
<p>${escape(scope?.simulation || 'Anatomical visibility does not establish a measured circuit, hormone concentration or drug response.')}</p></div></section>`;
}

/** Structure selection is independent of the network's functional node selection. */
export function anatomyContent(id, { structures = ANATOMY_STRUCTURES, sources = ANATOMY_SOURCES, scope = ANATOMY_SCOPE } = {}) {
  const structure = list(structures).find(item => item.id === id);
  if (!structure) return `<div class="anatomy-detail"><h2>Central nervous system anatomy</h2>${id == null ? '' : '<p>The requested structure is not available in this anatomy layer. Choose a structure from the anatomy selector.</p>'}${scopeContent(scope, sources)}</div>`;
  return `<div class="anatomy-detail"><h2>${escape(structure.name)}</h2><p><span class="evidence-pill">${escape(structure.group || 'Anatomical structure')}</span>${structure.kind ? ` <span class="evidence-pill">${escape(structure.kind)}</span>` : ''}</p>
<p><strong>${escape(structure.role)}</strong></p><p>${escape(structure.detail)}</p>
<div class="anatomy-actions">${focusButton(structure)}${['hypothalamus', 'anterior-pituitary', 'posterior-pituitary', 'pituitary-stalk', 'pineal'].includes(structure.id) ? '<button type="button" data-dialog="endocrine">Explore hormone pathways</button>' : ''}</div>
${references(structure.sourceIds, sources)}${scopeContent(scope, sources)}</div>`;
}

function stepContent(step, structures) {
  const structure = list(structures).find(item => item.id === step.organ);
  return `
<h3>${escape(step.label || structure?.name || step.organ || 'Pathway step')}</h3>
<p>${step.effect ? `<span class="evidence-pill">${escape(step.effect)}</span> ` : ''}${escape(step.signal)}</p>${step.route ? `<p class="endocrine-route"><strong>Route:</strong> ${escape(step.route)}</p>` : ''}
${structure ? focusButton(structure) : ''}`;
}

function pathwayFlow(steps, structures) {
  const stages = [];
  for (const step of list(steps)) {
    const last = stages.at(-1);
    if (step.parallelGroup && last?.[0].parallelGroup === step.parallelGroup) last.push(step);
    else stages.push([step]);
  }
  return stages.map((stage, index) => `<li class="endocrine-step${stage.length > 1 ? ' endocrine-parallel' : ''}"><span class="endocrine-step-number" aria-hidden="true">${index + 1}</span><div>${stage.length > 1 ? `<p><strong>Parallel inputs</strong> · these signals act on the pituitary in parallel, not one after the other.</p><ul class="endocrine-parallel-inputs">${stage.map(step => `<li class="endocrine-branch">${stepContent(step, structures)}</li>`).join('')}</ul>` : stepContent(stage[0], structures)}</div></li>`).join('');
}

/** Qualitative endocrine routes only: no invented kinetic or dose-response model. */
export function endocrineContent(pathwayId, { pathways = ENDOCRINE_PATHWAYS, structures = ANATOMY_STRUCTURES, sources = ANATOMY_SOURCES } = {}) {
  const available = list(pathways);
  const selectedId = pathwayId ?? available[0]?.id;
  const pathway = available.find(item => item.id === selectedId);
  const pituitarySources = list(structures).filter(item => ['hypothalamus', 'anterior-pituitary', 'posterior-pituitary'].includes(item.id)).flatMap(item => list(item.sourceIds));
  return `<div class="endocrine-pathways"><h2>Hypothalamus, pituitary &amp; hormone pathways</h2>
<div class="callout"><p><strong>Qualitative physiology reference</strong> · these pathways describe established anatomy and signaling. They are separate from the live drug and neural simulation; no hormone concentrations, secretion rates or drug-induced endocrine changes are calculated.</p></div>
<p>The <strong>anterior pituitary</strong> contains endocrine cells that synthesize and secrete their hormones in response to hypothalamic signals delivered through portal blood vessels. The <strong>posterior pituitary</strong> contains hypothalamic axon terminals: oxytocin and vasopressin (ADH) are synthesized in hypothalamic neurons, then transported to, stored in and released from the posterior pituitary.</p>
${references(pituitarySources, sources)}
<label class="endocrine-selector" for="endocrine-pathway-select">Choose a hormone pathway <select id="endocrine-pathway-select">${pathway ? '' : '<option value="" selected disabled>Choose a pathway</option>'}${available.map(item => `<option value="${escape(item.id)}"${item.id === selectedId ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label>
${pathway ? `<section aria-labelledby="endocrine-pathway-title"><h3 id="endocrine-pathway-title">${escape(pathway.name)}</h3><p>${escape(pathway.summary)}</p>
<ol class="endocrine-flow" aria-label="${escape(pathway.name)} sequence">${pathwayFlow(pathway.steps, structures)}</ol>
<section class="endocrine-feedback"><h3>Feedback and regulation</h3><p>${escape(pathway.feedback)}</p></section>
${list(pathway.limits).length ? `<section class="anatomy-limitations"><h3>What this pathway view does not simulate</h3><ul>${pathway.limits.map(limit => `<li>${escape(limit)}</li>`).join('')}</ul></section>` : ''}
${references(pathway.sourceIds, sources)}</section>` : '<p>The requested pathway is not available. Select a listed pathway to inspect its route and feedback.</p>'}
<p class="field-note">The sequence shows communication between organs, not elapsed time or a calculated hormone level. Organ shapes and positions are schematic. Peripheral glands and tissues mentioned here are not additional simulated CNS structures.</p></div>`;
}
