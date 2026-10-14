import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validationContent } from '../src/validation-content.js';

const report = {
  modelVersion: '3.3.0',
  scope: 'Selected independent conditional and cross-preparation comparisons only.',
  groups: [{
    title: 'Independent conditional PET comparison',
    classification: 'Independent observation; concentration transfer conditional',
    description: 'Published binding endpoint; measured total plasma is supplied to the model.',
    metrics: { previousMAE: 32.71, currentMAE: 14.03, unit: 'percentage points' },
    rows: [{ label: 'Study A', input: 'Published exposure', observed: 60, unit: '%', uncertainty: 'SEM 4%; n = 5', previousPrediction: 82, currentPrediction: 70, status: 'Residual mismatch', comparisonNote: 'No fitted pass threshold.', alternatives: [{ label: 'Sensitivity bound', range: [51, 75] }] }],
    limitations: ['Conditional on the supplied exposure.'],
    sources: [{ title: 'Study methods', url: 'https://example.org/study' }],
  }],
  coverage: [{ layer: 'Cognition', status: 'Unvalidated', detail: 'No experimental cognition comparison.' }],
};

test('validation distinguishes published observations, model revisions and descriptive errors', () => {
  const html = validationContent(report);
  for (const item of ['Independent conditional PET comparison', 'Observed', 'Previous model', 'Current model', 'Residual', '60 %', '82 %', '70 %', '+10 pp', 'SEM 4%; n = 5', 'Mean absolute error (MAE)', '32.71 percentage points', '14.03 percentage points', 'not an overall validation score', 'separate from the live experiment', 'not a model prediction interval', '51–75']) assert.ok(html.includes(item), item);
  assert.ok(html.includes('href="https://example.org/study"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test('unsupported outcomes remain null and are never rendered as zero or a passing result', () => {
  const html = validationContent({ groups: [{ title: 'Chronic history', rows: [{ label: 'Tolerance', observed: 25.6, unit: '%', previousPrediction: null, currentPrediction: null, status: 'Unsupported chronic history' }] }] });
  for (const item of ['25.6 %', 'Not available', 'Not modeled', 'Not evaluated', 'Unsupported chronic history']) assert.ok(html.includes(item), item);
  assert.ok(!html.includes('>0 %<'));
  assert.ok(!/\bPASS(?:ED)?\b/.test(html));
});

test('known discrepancies and limitations stay visible without a biological pass badge', () => {
  const html = validationContent(report);
  assert.ok(html.includes('Residual mismatch'));
  assert.ok(html.includes('<details class="validation-limitations" open>'));
  assert.ok(html.includes('What remains unvalidated'));
  assert.ok(html.includes('No experimental cognition comparison.'));
  assert.ok(!/class="[^"]*(?:success|pass|validated)[^"]*"/.test(html));
});

test('all report fields are escaped and unsafe source URLs are not linked', () => {
  const attack = '<img src=x onerror="alert(1)">';
  const html = validationContent({ modelVersion: attack, scope: attack, groups: [{ title: attack, classification: attack, description: attack, metrics: { previousMAE: 1, unit: attack }, rows: [{ label: attack, input: attack, observed: 1, unit: attack, uncertainty: attack, status: attack, comparisonNote: attack, alternatives: [{ label: attack, value: 1 }] }], sources: [{ title: attack, url: 'javascript:alert(1)' }], limitations: [attack] }], coverage: [{ layer: attack, status: attack, detail: attack }] });
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('onerror="'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('aria-labelledby="validation-group-0"'));
});

test('nonfinite numeric fields remain unavailable and group tables have accessible scrolling', () => {
  const html = validationContent({ groups: [{ title: 'Assay', rows: [{ observed: NaN, previousPrediction: Infinity, currentPrediction: -Infinity }] }] });
  assert.ok(html.includes('Not reported'));
  assert.ok(html.includes('Not available'));
  assert.ok(html.includes('Not modeled'));
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Infinity'));
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(html.includes('<caption>'));
});

test('validation entry points are present in the header and persistent evidence summary', () => {
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /<nav[^>]*>[\s\S]*?data-dialog="validation"[\s\S]*?<\/nav>/);
  assert.match(index, /class="evidence-summary"[\s\S]*?data-dialog="validation"/);
});
