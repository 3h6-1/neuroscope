import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../public/data/compound-catalog.json' with { type: 'json' };
import pet from '../public/data/validation-pet.json' with { type: 'json' };
import neural from '../public/data/validation-neural.json' with { type: 'json' };
import ddi from '../public/data/validation-interactions.json' with { type: 'json' };
import { runValidation } from '../src/validation.js';
import { staticClearanceFactor } from '../src/interaction-evidence.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('independent PET observations exclude calibration; frozen previous and production current outputs expose residuals', () => {
  const original = JSON.stringify(catalog);
  const report = runValidation(catalog), group = report.groups[0];
  assert.equal(JSON.stringify(catalog), original);
  assert.deepEqual(group.rows.map(r => r.observed), [57, 55, 73, 69]);
  assert.deepEqual(pet.benchmarks[0].points.map(p => p.input.value), [12, 12, 29, 29]);
  assert.ok(!pet.benchmarks[0].sourceIds.some(id => pet.benchmarks[0].calibrationSourceIds.includes(id)));
  near(group.metrics.previousMAE, 20.81138231015858);
  near(group.metrics.currentMAE, 4.116943762833994);
  near(group.rows[0].currentPrediction, 58.167716917111004);
  near(group.rows[3].currentPrediction - group.rows[3].observed, 8.066170608556988);
  assert.equal(group.rows.length, 4); // n=2 ranges cannot be converted into invented means.
  assert.match(group.limitations.join(' '), /not.*independent observations|share participants|group mean/);
  assert.ok(report.coverage.some(c => c.layer === 'Cognition and consciousness'));
});

test('changing the production profile changes benchmark output, so the audit is not disconnected from the model', () => {
  const changed = structuredClone(catalog);
  changed.compounds.find(p => p.id === 'aripiprazole').targets.find(t => t.target === 'D2').occupancyCalibration.ec50NgML *= 2;
  const baseline = runValidation(catalog).groups[0], modified = runValidation(changed).groups[0];
  assert.ok(modified.rows[0].currentPrediction < baseline.rows[0].currentPrediction);
  near(modified.metrics.previousMAE, baseline.metrics.previousMAE);
});

test('neural transfer discrepancies remain numeric; chronic history is unsupported rather than an acute prediction', () => {
  const report = runValidation(catalog), acute = report.groups[1], chronic = report.groups[2];
  assert.deepEqual(acute.rows.map(r => r.observed), [72.5, 49.079754601226995]);
  for (const row of acute.rows) near(row.currentPrediction, 112.19512195121952);
  near(acute.rows[0].currentPrediction - acute.rows[0].observed, 39.69512195121952);
  assert.equal(chronic.rows[0].currentPrediction, null);
  assert.equal(chronic.rows[0].previousPrediction, null);
  near(chronic.rows[0].observed, 25.6);
  assert.match(chronic.rows[0].alternatives[0].label, /NOT a chronic/);
  assert.ok(neural.benchmarks.every(p => p.fitUse === 'none'));
  assert.ok(neural.benchmarks.every(p => !neural.calibrationSourcesExcluded.some(s => s.id === p.sourceId)));
});

test('static interaction diagnostic preserves the failed parent prediction and reconstructs published alternatives', () => {
  const group = runValidation(catalog).groups[3], desipramine = group.rows[0];
  near(desipramine.currentPrediction, 1.0169012103818962, 1e-6);
  near(desipramine.observed, 5.2);
  near(desipramine.alternatives[0].value, 1.7314695643371, 1e-6);
  near(desipramine.alternatives[1].range[0], 3.945729748, 1e-6);
  near(desipramine.alternatives[1].range[1], 5.086170021, 1e-6);
  group.rows.forEach((row, i) => {
    const reference = ddi.cases[i];
    near(row.alternatives[0].value, reference.reportedPlasmaAllAUCR, 0.01);
    near(row.alternatives[1].range.reduce((s, n) => s + n, 0) / 2, reference.reportedLiverMeanAUCR, 0.01);
    assert.ok(row.currentPrediction < row.observed);
  });
});

test('shared clearance equation handles no inhibition, complete pathways, and invalid values', () => {
  near(staticClearanceFactor(0.9, 0), 1);
  near(staticClearanceFactor(0, 1e10), 1);
  near(staticClearanceFactor(1, 4), 0.2);
  near(staticClearanceFactor(0.9, 1e10), 0.1, 1e-9);
  for (const [fm, weight] of [[-1, 1], [2, 1], [NaN, 1], [0.5, -1], [0.5, Infinity]]) assert.throws(() => staticClearanceFactor(fm, weight), RangeError);
});
