import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeMetabolicInteractions, interactionProfileEvidence, inhibitionWeight, clearanceFractionFromAUCR, validateInteractionEvidence } from '../src/interaction-evidence.js';

const data = JSON.parse(fs.readFileSync(new URL('../public/data/interaction-evidence.json', import.meta.url)));
const profiles = JSON.parse(fs.readFileSync(new URL('../public/data/compound-catalog.json', import.meta.url))).compounds;
// Explicit markers make these fixtures independent of catalog migration order.
for (const p of profiles) p.metabolism.interactionEvidenceId = p.id;
const profileMap = new Map(profiles.map(p => [p.id, p]));
const exposure = (id, freePlasmaNM = 100, extra = {}) => ({ id, active: true, freePlasmaNM, ...extra });
const approx = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('interaction evidence includes resolvable primary provenance and explicit assay conversion assumptions', () => {
  assert.equal(validateInteractionEvidence(data), data);
  assert.equal(data.inhibitionAssays.length, 2);
  assert.equal(data.clearanceModels.length, 2);
  for (const a of data.inhibitionAssays) assert.ok(a.assumptions.some(s => /metabolite|Norfluoxetine/.test(s)));
  for (const r of data.clinicalReferences) assert.ok(r.applicability && r.population && r.regimen);
});

test('bupropion uses the 2025 measured parent Ki in nM, not the old arbitrary 100 nM', () => {
  const assay = interactionProfileEvidence('bupropion').inhibitionAssays[0];
  assert.equal(assay.components[0].kiNM, 12650);
  approx(inhibitionWeight(12650, assay), 1);
  approx(inhibitionWeight(100, assay), 100 / 12650);
});

test('Sager total Ki is corrected once by incubation binding and distinct enantiomers are retained', () => {
  const assay = interactionProfileEvidence('fluoxetine').inhibitionAssays[0];
  assert.deepEqual(assay.components.map(c => c.kiNM), [860, 68]);
  assert.deepEqual(assay.components.map(c => c.microsomalUnboundFraction), [0.48, 0.52]);
  approx(inhibitionWeight(100, assay), 50 / 412.8 + 50 / 35.36);
  assert.ok(assay.components.every(c => c.bindingEvidence.includes('footnote m')));
  assert.ok(assay.assumptions.some(s => s.includes('50:50')));
});

test('trial AUC ratios become explicitly derived fractions, not measured fractions', () => {
  const ari = interactionProfileEvidence('aripiprazole').clearanceModels[0];
  const lsd = interactionProfileEvidence('lsd').clearanceModels[0];
  approx(ari.fraction, 1 - 1 / 2.12);
  approx(lsd.fraction, 1 - 1 / 1.76);
  approx(lsd.derivedFractionStudyInterval[0], 1 - 1 / 1.44);
  approx(lsd.derivedFractionStudyInterval[1], 1 - 1 / 2.14);
  assert.match(ari.evidenceType, /derived estimate/);
  assert.ok(ari.assumptions.some(s => /complete and selective/.test(s)));
});

test('free parent concentration controls partial clearance, with the uninhibited residual preserved', () => {
  const fm = 1 - 1 / 2.12;
  const concentrations = [0, 1, 100, 12650, 1e12];
  const factors = concentrations.map(c => computeMetabolicInteractions([exposure('bupropion', c), exposure('aripiprazole')], profiles).factors.aripiprazole);
  assert.equal(factors[0], 1);
  approx(factors[3], 1 - fm / 2);
  approx(factors.at(-1), 1 - fm, 1e-8);
  for (let i = 1; i < factors.length; i++) assert.ok(factors[i] < factors[i - 1] && factors[i] >= 1 - fm);
});

test('two inhibitors compete through summed parent Iu/Kiu with a substrate-specific fraction', () => {
  const state = computeMetabolicInteractions([exposure('bupropion', 12650), exposure('fluoxetine', 100), exposure('aripiprazole'), exposure('lsd')], profileMap);
  const w = 1 + 50 / 412.8 + 50 / 35.36;
  approx(state.factors.aripiprazole, 1 - (1 - 1 / 2.12) * w / (1 + w));
  approx(state.factors.lsd, 1 - (1 - 1 / 1.76) * w / (1 + w));
  assert.notEqual(state.factors.aripiprazole, state.factors.lsd);
  assert.equal(state.factors.bupropion, 1);
});

test('fast integration path has identical factors without constructing presentation metadata', () => {
  const e = [exposure('bupropion', 500), exposure('fluoxetine', 100), exposure('aripiprazole'), exposure('lsd')];
  const full = computeMetabolicInteractions(e, profiles);
  const fast = computeMetabolicInteractions(e, profiles, { includeEvidence: false });
  assert.deepEqual(fast.factors, full.factors);
  assert.equal(fast.interactions.length, 0);
  assert.equal(fast.references.length, 0);
});

test('unsupported substrate fractions are unquantified rather than silently receiving fifty percent clearance allocation', () => {
  const state = computeMetabolicInteractions([exposure('bupropion', 1000), exposure('fluoxetine')], profiles);
  assert.equal(state.factors.fluoxetine, 1);
  const row = state.interactions.find(i => i.substrateId === 'fluoxetine');
  assert.equal(row.modeled, false);
  assert.equal(row.clearanceFactor, null);
  assert.match(row.evidence, /No numeric clearance change/);
});

test('self-inhibition is not added on top of the empirical terminal half-life', () => {
  const state = computeMetabolicInteractions([exposure('fluoxetine', 1e6)], profiles);
  assert.equal(state.factors.fluoxetine, 1);
  assert.equal(state.interactions.length, 0);
  assert.ok(state.limitations.some(s => s.startsWith('Self-inhibition')));
});

test('inactive and zero-concentration inhibitors do not change clearance', () => {
  for (const e of [exposure('bupropion', 12650, { active: false }), exposure('bupropion', 0)]) {
    const state = computeMetabolicInteractions([e, exposure('aripiprazole')], profiles);
    assert.equal(state.factors.aripiprazole, 1);
    assert.equal(state.interactions.length, 0);
  }
});

test('plasma free fraction is applied once and explicit free plasma input takes priority', () => {
  const fromTotal = computeMetabolicInteractions([{ id: 'bupropion', plasmaNM: 1000 }, exposure('aripiprazole')], profiles);
  const fromFree = computeMetabolicInteractions([exposure('bupropion', 160), exposure('aripiprazole')], profiles);
  approx(fromTotal.factors.aripiprazole, fromFree.factors.aripiprazole);
  const both = computeMetabolicInteractions([exposure('bupropion', 160, { plasmaNM: 1e6 }), exposure('aripiprazole')], profiles);
  approx(both.factors.aripiprazole, fromFree.factors.aripiprazole);
});

test('a custom profile reusing a known id cannot inherit curated assay confidence or kinetics', () => {
  const custom = profiles.map(p => p.id === 'bupropion' ? { ...p, custom: true } : p);
  const state = computeMetabolicInteractions([exposure('bupropion', 12650), exposure('aripiprazole')], custom);
  assert.equal(state.factors.aripiprazole, 1);
  assert.equal(state.interactions[0].clearanceFactor, null);
  assert.equal(state.interactions[0].partial, true);
  assert.equal(interactionProfileEvidence(custom.find(p => p.id === 'bupropion')).inhibitionAssays.length, 0);
  assert.ok(!state.references.some(r => r.id === 'bupropion-desipramine-observation'));
});

test('a known id without an explicit evidence marker cannot inherit the curated model', () => {
  const unmarked = structuredClone(profiles);
  delete unmarked.find(p => p.id === 'bupropion').metabolism.interactionEvidenceId;
  const state = computeMetabolicInteractions([exposure('bupropion', 12650), exposure('aripiprazole')], unmarked);
  assert.equal(state.factors.aripiprazole, 1);
  assert.equal(state.interactions[0].modeled, false);
});

test('clinical observations remain independent of user concentration and are never substituted for kinetics', () => {
  const low = computeMetabolicInteractions([exposure('bupropion', 1), exposure('aripiprazole')], profiles);
  const high = computeMetabolicInteractions([exposure('bupropion', 12650), exposure('aripiprazole')], profiles);
  assert.deepEqual(low.references, high.references);
  assert.notEqual(low.factors.aripiprazole, high.factors.aripiprazole);
  assert.equal(low.references.find(r => r.id === 'bupropion-desipramine-observation').observedAUCR, 5);
  assert.ok(low.factors.aripiprazole > 0.99);
});

test('fluoxetine–diazepam human study card requires both compounds and does not invent an AUC multiplier', () => {
  const solo = computeMetabolicInteractions([exposure('fluoxetine')], profiles);
  const both = computeMetabolicInteractions([exposure('fluoxetine'), exposure('diazepam')], profiles);
  assert.ok(!solo.references.some(r => r.id === 'fluoxetine-diazepam-observation'));
  const reference = both.references.find(r => r.id === 'fluoxetine-diazepam-observation');
  assert.ok(reference);
  assert.equal(reference.observedAUCR, undefined);
  assert.equal(both.factors.diazepam, 1);
  assert.match(reference.applicability, /No numeric multiplier/);
});

test('inspector results can be edited by a caller without mutating the canonical evidence', () => {
  const first = interactionProfileEvidence('bupropion');
  first.inhibitionAssays[0].components[0].kiNM = 1;
  first.sources[0].title = 'modified';
  assert.equal(interactionProfileEvidence('bupropion').inhibitionAssays[0].components[0].kiNM, 12650);
  assert.notEqual(interactionProfileEvidence('bupropion').sources[0].title, 'modified');
});

test('invalid units, concentrations, fractions and missing provenance fail explicitly', () => {
  for (const concentration of [-1, Infinity, NaN]) assert.throws(() => computeMetabolicInteractions([exposure('bupropion', concentration)], profiles));
  for (const ratio of [0, -1, 0.5, NaN, Infinity]) assert.throws(() => clearanceFractionFromAUCR(ratio));
  for (const mutate of [
    d => { d.inhibitionAssays[0].components[0].kiNM = 0; },
    d => { d.inhibitionAssays[0].components[0].microsomalUnboundFraction = 2; },
    d => { d.inhibitionAssays[1].components[0].parentFraction = 0.4; },
    d => { d.inhibitionAssays[0].sourceIds = ['missing']; },
    d => { delete d.clinicalReferences[0].population; },
    d => { d.clearanceModels[1].observedAUCR90CI = [1.8, 2]; },
  ]) { const invalid = structuredClone(data); mutate(invalid); assert.throws(() => validateInteractionEvidence(invalid)); }
});
