import test from 'node:test';
import assert from 'node:assert/strict';
import { anatomyContent, endocrineContent, anatomyInspection } from '../src/anatomy-content.js';
import { ANATOMY_STRUCTURES, ENDOCRINE_PATHWAYS } from '../src/anatomy-data.js';

test('picked peripheral roots and MRI cortex retain their actual anatomical classification',()=>{
  const root={anatomyId:'spinal-cord',type:'internal-anatomy',peripheralContext:true,description:'Peripheral nerve root outside spinal cord tissue.'};
  const shown=anatomyInspection(root);
  assert.match(shown.label,/nerve root/);assert.equal(shown.description,root.description);assert.match(shown.detail,/Peripheral nervous system/);
  assert.equal(root.label,undefined,'inspection does not mutate picked metadata');
  const cortex={anatomyId:'cerebrum',type:'brain-surface',label:'Left cortex · fsaverage5',description:'MRI-derived FreeSurfer reference.'};
  assert.equal(anatomyInspection(cortex).label,cortex.label);
  assert.equal(anatomyInspection(cortex).description,cortex.description);
  assert.match(anatomyInspection(cortex).detail,/MRI-derived/);
  assert.match(anatomyInspection({...cortex,source:'procedural fallback'}).detail,/Procedural fallback/);
  const gland=anatomyInspection({anatomyId:'posterior-pituitary',type:'internal-anatomy'});
  assert.match(gland.description,/made in hypothalamic neurons/);assert.match(gland.detail,/Schematic/);
});

test('anatomy evidence renders each structure with its own location control and sourced role', () => {
  for (const structure of ANATOMY_STRUCTURES) {
    const html = anatomyContent(structure.id);
    assert.ok(html.includes(`<h2>${structure.name}</h2>`), structure.id);
    assert.ok(html.includes(`data-anatomy-focus="${structure.id}"`), structure.id);
    assert.ok(html.includes('class="anatomy-sources"'), structure.id);
    assert.ok(html.includes('Central nervous system and endocrine organs'), structure.id);
    assert.ok(html.includes('rel="noopener noreferrer"'), structure.id);
  }
});

test('anatomy overview and unknown selections do not fabricate a structure', () => {
  const overview = anatomyContent();
  assert.ok(overview.includes('Central nervous system anatomy'));
  assert.ok(!overview.includes('requested structure is not available'));
  const unknown = anatomyContent('missing-structure');
  assert.ok(unknown.includes('requested structure is not available'));
  assert.ok(!unknown.includes('data-anatomy-focus="missing-structure"'));
  assert.ok(!unknown.includes('undefined'));
});

test('endocrine routes distinguish anterior secretion from hypothalamic synthesis and posterior release', () => {
  const html = endocrineContent();
  assert.ok(html.includes('anterior pituitary</strong> contains endocrine cells that synthesize and secrete'));
  assert.ok(html.includes('hypothalamic signals delivered through portal blood vessels'));
  assert.ok(html.includes('posterior pituitary</strong> contains hypothalamic axon terminals'));
  assert.ok(html.includes('oxytocin and vasopressin (ADH) are synthesized in hypothalamic neurons'));
  assert.ok(html.includes('transported to, stored in and released from the posterior pituitary'));
  assert.ok(html.includes('no hormone concentrations, secretion rates or drug-induced endocrine changes are calculated'));
  assert.ok(html.includes('Peripheral glands and tissues mentioned here are not additional simulated CNS structures'));
});

test('every pathway has a selected option, an ordered route, feedback and stated limits', () => {
  const structureIds = new Set(ANATOMY_STRUCTURES.map(item => item.id));
  for (const pathway of ENDOCRINE_PATHWAYS) {
    const html = endocrineContent(pathway.id);
    assert.ok(html.includes(`value="${pathway.id}" selected`), pathway.id);
    assert.ok(html.includes('<ol class="endocrine-flow"'), pathway.id);
    assert.ok(html.includes('Feedback and regulation'), pathway.id);
    assert.ok(html.includes('What this pathway view does not simulate'), pathway.id);
    assert.ok(html.includes('class="anatomy-sources"'), pathway.id);
    for (const step of pathway.steps) {
      if (structureIds.has(step.organ)) assert.ok(html.includes(`data-anatomy-focus="${step.organ}"`), `${pathway.id} / ${step.organ}`);
      else assert.ok(!html.includes(`data-anatomy-focus="${step.organ}"`), `${pathway.id} / peripheral target`);
    }
  }
});

test('unknown pathways retain a chooser without substituting a false active pathway', () => {
  const html = endocrineContent('missing-pathway');
  assert.ok(html.includes('requested pathway is not available'));
  assert.ok(html.includes('<option value="" selected disabled>'));
  assert.ok(!html.includes('class="endocrine-flow"'));
  assert.ok(!html.includes('undefined'));
});

test('growth-hormone stimulation and inhibition are rendered as parallel inputs', () => {
  const html = endocrineContent('gh-igf1');
  assert.ok(html.includes('class="endocrine-step endocrine-parallel"'));
  assert.ok(html.includes('Parallel inputs'));
  assert.ok(html.includes('not one after the other'));
  assert.equal((html.match(/class="endocrine-branch"/g) || []).length, 2);
  assert.equal((html.match(/class="endocrine-step-number"/g) || []).length, 3);
  assert.ok(html.includes('>stimulates</span>'));
  assert.ok(html.includes('>inhibits</span>'));
});

test('anatomy content escapes all structure, scope and source text and rejects executable URLs', () => {
  const attack = '<img src=x onerror="alert(1)">';
  const html = anatomyContent(attack, {
    structures: [{ id: attack, name: attack, group: attack, kind: attack, role: attack, detail: attack, sourceIds: ['bad', 'good'] }],
    sources: [{ id: 'bad', title: attack, url: 'javascript:alert(1)' }, { id: 'good', title: 'Source', url: 'https://example.org/?q="test"' }],
    scope: { classification: attack, centralNervousSystem: attack, associatedEndocrine: attack, geometry: attack, simulation: attack, sourceIds: ['bad'] },
  });
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('onerror="'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('href="https://example.org/?q=%22test%22"'));
});

test('endocrine content escapes pathway ids, options, routes, feedback and limitations', () => {
  const attack = '<svg onload="alert(1)">';
  const html = endocrineContent(attack, {
    structures: [{ id: attack, name: attack }],
    pathways: [{ id: attack, name: attack, summary: attack, steps: [{ organ: attack, label: attack, signal: attack, route: attack, effect: attack, parallelGroup: attack }], feedback: attack, limits: [attack], sourceIds: ['bad'] }],
    sources: [{ id: 'bad', title: attack, url: 'data:text/html,<script>alert(1)</script>' }],
  });
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.includes('onload="'));
  assert.ok(!html.includes('href="data:'));
  assert.ok(html.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('aria-label="&lt;svg onload=&quot;alert(1)&quot;&gt; sequence"'));
});
