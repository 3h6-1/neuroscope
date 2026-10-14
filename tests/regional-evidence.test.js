import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONAL_ATLAS, REGIONAL_PARCEL_MAPPING, regionalSensitivity } from '../src/regional-evidence.js';

const fallback = Object.freeze({ SERT: 0.7, DAT: 0.5, NET: 0.8, D2: 0.5, HT2A: 0.8, HT1A: 0.7, GABAA: 1, NMDA: 1, ADENOSINE: 0.8, NACHR: 0.7 });
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('regional PET data retain pinned provenance, author attribution and the source license', () => {
  assert.equal(REGIONAL_ATLAS.schemaVersion, 1);
  assert.equal(REGIONAL_ATLAS.revision, 'f8b41da92a733f99368c1f39d4959731aa1316c1');
  assert.equal(REGIONAL_ATLAS.license, 'CC-BY-NC-SA-4.0');
  assert.match(REGIONAL_ATLAS.attribution, /Hansen/);
  assert.equal(REGIONAL_ATLAS.parcels.length, 83);
  assert.deepEqual(Object.keys(REGIONAL_ATLAS.maps).sort(), ['D2', 'DAT', 'GABAA', 'HT1A', 'HT2A', 'SERT']);
  for (const map of Object.values(REGIONAL_ATLAS.maps)) {
    assert.match(map.sha256, /^[a-f\d]{64}$/);
    assert.ok(map.dataUrl.includes(REGIONAL_ATLAS.revision));
    assert.match(map.sourceUrl, /^https:\/\/doi\.org\//);
    assert.ok(Number.isInteger(map.sampleSize) && map.sampleSize > 0);
    assert.equal(map.values.length, 83);
    assert.ok(map.values.every(Number.isFinite));
  }
});

test('atlas index order is verified rather than assuming the left hemisphere comes first', () => {
  assert.deepEqual(REGIONAL_ATLAS.parcels.map(p => p.index), Array.from({ length: 83 }, (_, i) => i));
  assert.deepEqual(REGIONAL_ATLAS.parcels[0], { index: 0, code: 1, label: 'lateralorbitofrontal', hemisphere: 'R', structure: 'cortex' });
  assert.deepEqual(REGIONAL_ATLAS.parcels[41], { index: 41, code: 42, label: 'lateralorbitofrontal', hemisphere: 'L', structure: 'cortex' });
  assert.equal(REGIONAL_ATLAS.parcels[76].label, 'caudate');
  assert.equal(REGIONAL_ATLAS.parcels[76].hemisphere, 'L');
});

test('left dorsolateral prefrontal weight reproduces the pinned PET extraction', () => {
  const result = regionalSensitivity('dlpfc_l', fallback);
  const evidence = result.evidenceByTarget.HT2A;
  assert.equal(evidence.type, 'pet-derived');
  assert.deepEqual(evidence.atlasRegions.map(p => p.index), [47, 49]);
  close(evidence.rawValue, 57.903905108464);
  close(evidence.normalization.denominator, 52.01973502634696);
  close(result.weights.HT2A, 1.1131141878968978);
  assert.equal(evidence.rawUnits, 'pmol/mL');
  assert.equal(evidence.sampleSize, 29);
  assert.equal(evidence.normalization.estimated, true);
  assert.ok(evidence.limitations.some(note => note.includes('no fitted firing-effect coefficient')));
});

test('left and right values are preserved independently', () => {
  const left = regionalSensitivity('dlpfc_l', fallback);
  const right = regionalSensitivity('dlpfc_r', fallback);
  close(right.evidenceByTarget.HT2A.rawValue, 56.36865028510856);
  assert.notEqual(left.weights.HT2A, right.weights.HT2A);
  assert.ok(left.evidenceByTarget.HT2A.atlasRegions.every(p => p.hemisphere === 'L'));
  assert.ok(right.evidenceByTarget.HT2A.atlasRegions.every(p => p.hemisphere === 'R'));
});

test('normalization uses explicit full reference sets rather than the displayed region subset', () => {
  for (const [target, map] of Object.entries(REGIONAL_ATLAS.maps)) {
    const indices = target === 'DAT'
      ? [35, 36, 76, 77]
      : [...Array.from({ length: 34 }, (_, i) => i), ...Array.from({ length: 34 }, (_, i) => i + 41)];
    assert.deepEqual(map.normalizationReference, indices);
    close(map.normalizationMean, indices.reduce((sum, i) => sum + map.values[i], 0) / indices.length);
  }
});

test('DAT uses supported striatal data and does not turn low/negative cortical PET binding into density', () => {
  assert.ok(REGIONAL_ATLAS.maps.DAT.values.some(value => value < 0), 'Original negative observations must remain inspectable');
  const striatum = regionalSensitivity('striatum_l', fallback);
  assert.equal(striatum.evidenceByTarget.DAT.type, 'pet-derived');
  close(striatum.evidenceByTarget.DAT.rawValue, 2.439858419105337);
  close(striatum.weights.DAT, 0.8696576864527986);
  assert.equal(striatum.evidenceByTarget.DAT.sampleSize, 6);
  const cortex = regionalSensitivity('dlpfc_l', fallback);
  assert.equal(cortex.evidenceByTarget.DAT.type, 'estimated');
  assert.equal(cortex.weights.DAT, fallback.DAT);
  assert.match(cortex.evidenceByTarget.DAT.limitations.join(' '), /negative extrastriatal/);
});

test('extrastriatal D2/3 data do not masquerade as validated striatal D2 measurements', () => {
  const striatum = regionalSensitivity('striatum_r', fallback);
  assert.equal(striatum.evidenceByTarget.D2.type, 'estimated');
  assert.equal(striatum.weights.D2, fallback.D2);
  const cortex = regionalSensitivity('pcc_r', fallback);
  assert.equal(cortex.evidenceByTarget.D2.type, 'pet-derived');
  assert.equal(cortex.evidenceByTarget.D2.rawUnits, 'dimensionless BP_ND');
  assert.ok(cortex.evidenceByTarget.D2.limitations.some(note => note.includes('D2/3')));
});

test('unresolved nuclei and territories retain all fallbacks with explicit reasons', () => {
  for (const region of ['md_thalamus_l', 'md_thalamus_r', 'cerebellum_l', 'cerebellum_r', 'raphe', 'lc']) {
    const result = regionalSensitivity(region, fallback);
    assert.deepEqual(result.weights, fallback);
    assert.ok(Object.values(result.evidenceByTarget).every(entry => entry.type === 'estimated' && entry.limitations.length >= 2));
    assert.match(result.summary, /^0\/10/);
  }
});

test('targets with no compatible spatial data remain estimated in every mapped node', () => {
  for (const base of Object.keys(REGIONAL_PARCEL_MAPPING)) {
    for (const side of ['l', 'r']) {
      const result = regionalSensitivity(`${base}_${side}`, fallback);
      for (const target of ['NET', 'NMDA', 'ADENOSINE', 'NACHR']) {
        assert.equal(result.weights[target], fallback[target]);
        assert.equal(result.evidenceByTarget[target].type, 'estimated');
      }
    }
  }
});

test('coverage is 120 PET spatial proxies out of 300 regional-target pairs, not 120 fitted firing effects', () => {
  const ids = [...Object.keys(REGIONAL_PARCEL_MAPPING).flatMap(base => [`${base}_l`, `${base}_r`]), 'md_thalamus_l', 'md_thalamus_r', 'cerebellum_l', 'cerebellum_r', 'raphe', 'lc'];
  const evidence = ids.flatMap(id => Object.values(regionalSensitivity(id, fallback).evidenceByTarget));
  assert.equal(evidence.length, 300);
  assert.equal(evidence.filter(entry => entry.type === 'pet-derived').length, 120);
  assert.ok(evidence.every(entry => entry.limitations.some(note => note.includes('remain model estimates'))));
});

test('within-target normalization preserves the source map ratios without mixing tracer units', () => {
  const hippocampus = regionalSensitivity('hippocampus_l', fallback).evidenceByTarget;
  const amygdala = regionalSensitivity('amygdala_l', fallback).evidenceByTarget;
  for (const target of ['SERT', 'HT1A', 'HT2A', 'GABAA', 'D2']) {
    close(hippocampus[target].weight / amygdala[target].weight, hippocampus[target].rawValue / amygdala[target].rawValue);
  }
});

test('evidence and weights are immutable; invalid fallback input is rejected', () => {
  const result = regionalSensitivity('ofc_l', fallback);
  assert.throws(() => { result.weights.SERT = 999; }, TypeError);
  assert.throws(() => { result.evidenceByTarget.SERT.atlasRegions[0].index = 1; }, TypeError);
  assert.throws(() => regionalSensitivity(null, fallback), TypeError);
  assert.throws(() => regionalSensitivity('ofc_l', []), TypeError);
  for (const bad of [-1, NaN, Infinity]) assert.throws(() => regionalSensitivity('ofc_l', { SERT: bad }), RangeError);
});
