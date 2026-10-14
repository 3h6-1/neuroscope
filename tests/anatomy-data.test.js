import test from 'node:test';
import assert from 'node:assert/strict';
import { ANATOMY_SCOPE, ANATOMY_SOURCES, ANATOMY_STRUCTURES, ENDOCRINE_PATHWAYS } from '../src/anatomy-data.js';

const byStructure = new Map(ANATOMY_STRUCTURES.map(item => [item.id, item]));
const byPathway = new Map(ENDOCRINE_PATHWAYS.map(item => [item.id, item]));

test('anatomy and endocrine evidence references resolve to identified HTTPS sources', () => {
  const sourceIds = new Set(ANATOMY_SOURCES.map(source => source.id));
  assert.equal(sourceIds.size, ANATOMY_SOURCES.length);
  for (const source of ANATOMY_SOURCES) {
    assert.ok(source.title.length > 10);
    assert.equal(new URL(source.url).protocol, 'https:');
  }
  for (const item of [ANATOMY_SCOPE, ...ANATOMY_STRUCTURES, ...ENDOCRINE_PATHWAYS]) {
    assert.ok(item.sourceIds.length > 0);
    for (const id of item.sourceIds) assert.ok(sourceIds.has(id), `Unresolved reference: ${id}`);
  }
  assert.equal(byStructure.size, ANATOMY_STRUCTURES.length);
  assert.equal(byPathway.size, ENDOCRINE_PATHWAYS.length);
});

test('CNS anatomy includes deep structures, differentiated pituitary lobes and spinal cord', () => {
  for (const id of ['hypothalamus', 'anterior-pituitary', 'posterior-pituitary', 'pituitary-stalk', 'thalamus', 'midbrain', 'pons', 'medulla', 'spinal-cord']) {
    const structure = byStructure.get(id);
    assert.ok(structure, `Missing structure ${id}`);
    for (const field of ['name', 'group', 'kind', 'role', 'detail']) assert.ok(structure[field].length > 0);
  }
  assert.match(ANATOMY_SCOPE.centralNervousSystem, /brain and spinal cord/);
  assert.match(ANATOMY_SCOPE.centralNervousSystem, /outside the CNS/);
  assert.match(byStructure.get('anterior-pituitary').kind, /glandular/);
  assert.match(byStructure.get('posterior-pituitary').kind, /neural/);
  assert.equal(byStructure.get('ventricles').kind, 'fluid spaces');
});

test('anterior hormones and posterior synthesis-versus-release routes remain distinct', () => {
  for (const hormone of ['ACTH', 'TSH', 'LH', 'FSH', 'GH', 'prolactin']) {
    assert.ok(byStructure.get('anterior-pituitary').role.includes(hormone));
  }
  for (const id of ['vasopressin', 'oxytocin']) {
    const pathway = byPathway.get(id);
    assert.equal(pathway.steps[0].organ, 'hypothalamus');
    assert.equal(pathway.steps[0].effect, 'synthesizes');
    assert.match(pathway.steps[0].route, /Axonal transport/);
    assert.equal(pathway.steps[1].organ, 'posterior-pituitary');
    assert.equal(pathway.steps[1].effect, 'releases');
    assert.match(pathway.steps[1].route, /Systemic blood/);
    assert.ok(!pathway.steps.some(step => step.organ === 'anterior-pituitary'));
  }
});

test('adrenal and thyroid axes preserve organ order and negative feedback', () => {
  for (const [id, endOrgan, signals] of [
    ['hpa', 'adrenal-cortex', ['CRH', 'ACTH', 'Cortisol']],
    ['hpt', 'thyroid', ['TRH', 'TSH', 'T4']],
  ]) {
    const pathway = byPathway.get(id);
    assert.deepEqual(pathway.steps.map(step => step.organ), ['hypothalamus', 'anterior-pituitary', endOrgan]);
    pathway.steps.forEach((step, index) => assert.ok(step.signal.includes(signals[index])));
    assert.match(pathway.steps[0].route, /Portal blood/);
    assert.match(pathway.feedback, /reduces|suppress/);
  }
});

test('endocrine exceptions prevent a generic stimulatory three-gland model', () => {
  const growth = byPathway.get('gh-igf1');
  assert.equal(growth.steps.find(step => step.signal.includes('GHRH')).effect, 'stimulates');
  assert.equal(growth.steps.find(step => step.signal.includes('Somatostatin')).effect, 'inhibits');
  assert.equal(growth.steps[0].parallelGroup, growth.steps[1].parallelGroup);
  assert.ok(growth.steps[0].parallelGroup);
  assert.match(growth.limits.join(' '), /parallel/);
  assert.equal(byPathway.get('prolactin').steps[0].effect, 'inhibits');
  assert.match(byPathway.get('prolactin').limits.join(' '), /striatal D2 occupancy alone cannot predict/);
  assert.match(byPathway.get('hpg').feedback, /positive feedback before ovulation/);
  assert.match(byPathway.get('hpg').feedback, /inhibin suppresses FSH/);
});

test('anatomy and pathway layers expose their qualitative scope without invented kinetic parameters', () => {
  assert.match(ANATOMY_SCOPE.geometry, /schematic.*not MRI segmentations/);
  assert.match(ANATOMY_SCOPE.simulation, /do not calculate hormone concentrations/);
  for (const pathway of ENDOCRINE_PATHWAYS) {
    assert.ok(Array.isArray(pathway.limits) && pathway.limits.length > 0);
    assert.ok(pathway.feedback.length > 10);
    for (const step of pathway.steps) {
      assert.ok(step.organ && step.label && step.signal && step.route && step.effect);
    }
    assert.ok(!Object.keys(pathway).some(key => /rateConstant|concentration|halfLife|gain/.test(key)));
  }
});
