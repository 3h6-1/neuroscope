import catalog from '../public/data/compound-catalog.json' with { type: 'json' };
import { runValidation } from '../src/validation.js';

const report = runValidation(catalog);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`NeuroScope ${report.modelVersion} — published experimental comparisons\n${report.scope}`);
  for (const group of report.groups) {
    console.log(`\n${group.title}\n${group.classification}\n${group.description}`);
    console.table(group.rows.map(row => ({ experiment: row.label, observed: row.observed,
      previous: row.previousPrediction, current: row.currentPrediction,
      residual: row.currentPrediction === null ? null : row.currentPrediction - row.observed,
      unit: row.unit, residualUnit: row.unit === '%' ? 'pp' : row.unit, status: row.status })));
    if (group.metrics) console.log('MAE:', group.metrics);
    for (const row of group.rows) for (const alternative of row.alternatives || []) console.log(`${row.label} — ${alternative.label}: ${alternative.range?.join('–') ?? alternative.value}`);
    for (const limitation of group.limitations) console.log(`Limit: ${limitation}`);
    for (const source of group.sources) console.log(`Source: ${source.title} — ${source.url}`);
  }
  console.log('\nNo overall biological pass/fail is assigned. Automated tests check equations, data transcription and replay; they cannot establish scientific validity.');
}
