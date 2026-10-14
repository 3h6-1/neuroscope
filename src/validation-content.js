import { escapeHTML } from './content.js';

const e = escapeHTML;
const list = value => Array.isArray(value) ? value : [];
const numeric = value => Number.isFinite(value) ? Number(value.toPrecision(5)).toLocaleString('en-US', { maximumFractionDigits: 5 }) : null;
const amount = (value, unit, fallback = 'Not available') => numeric(value) === null ? fallback : `${e(numeric(value))}${unit ? ` ${e(unit)}` : ''}`;

function sourceLink(source = {}) {
  const title = e(source.title || 'Published source');
  try {
    const url = new URL(String(source.url));
    if (url.protocol === 'https:' || url.protocol === 'http:') return `<a href="${e(url.href)}" target="_blank" rel="noopener noreferrer">${title} ↗</a>`;
  } catch { /* Missing or unsupported links remain plain, escaped text. */ }
  return title;
}

function alternativeContent(alternatives) {
  if (!list(alternatives).length) return '';
  return `<details class="validation-alternatives"><summary>Reported alternatives / sensitivity</summary><ul>${alternatives.map(item => `<li>${e(item.label || 'Alternative')}${Number.isFinite(item.value) ? `: ${amount(item.value)}` : list(item.range).length === 2 && item.range.every(Number.isFinite) ? `: ${amount(item.range[0])}–${amount(item.range[1])}` : ''}</li>`).join('')}</ul></details>`;
}

function resultRow(row = {}) {
  const difference = Number.isFinite(row.currentPrediction) && Number.isFinite(row.observed) ? row.currentPrediction - row.observed : null;
  const residualUnit = row.unit === '%' ? 'pp' : row.unit;
  const residual = Number.isFinite(difference) ? `${difference > 0 ? '+' : ''}${amount(difference, residualUnit)}` : 'Not evaluated';
  return `<tr><th scope="row"><strong>${e(row.label || row.id || 'Observation')}</strong>${row.input ? `<small>${e(row.input)}</small>` : ''}<span class="validation-status">${e(row.status || 'Scope not classified')}</span>${row.comparisonNote ? `<small>${e(row.comparisonNote)}</small>` : ''}${alternativeContent(row.alternatives)}</th><td>${amount(row.observed, row.unit, 'Not reported')}${row.uncertainty ? `<small>${e(row.uncertainty)}</small>` : ''}</td><td>${amount(row.previousPrediction, row.unit)}</td><td>${amount(row.currentPrediction, row.unit, 'Not modeled')}</td><td>${residual}</td></tr>`;
}

function groupContent(group = {}, index) {
  const metrics = group.metrics || {};
  return `<section class="validation-group" aria-labelledby="validation-group-${index}"><h3 id="validation-group-${index}">${e(group.title || 'Experimental comparison')}</h3><span class="validation-classification">${e(group.classification || 'Comparison scope unspecified')}</span>${group.description ? `<p>${e(group.description)}</p>` : ''}
${Number.isFinite(metrics.previousMAE) || Number.isFinite(metrics.currentMAE) ? `<p class="validation-metrics"><strong>Mean absolute error (MAE)</strong> · previous ${amount(metrics.previousMAE, metrics.unit)} · current ${amount(metrics.currentMAE, metrics.unit)}. Descriptive error for this group; not an overall validation score.</p>` : ''}
${list(group.rows).length ? `<div class="validation-table-scroll" role="region" aria-label="${e(group.title || 'Experimental comparison')} results; scroll horizontally if needed" tabindex="0"><table class="validation-table"><caption>Published observations versus model outputs. Residual = current model − observation; pp = percentage points.</caption><thead><tr><th scope="col">Experiment / scope</th><th scope="col">Observed</th><th scope="col">Previous model</th><th scope="col">Current model</th><th scope="col">Residual</th></tr></thead><tbody>${group.rows.map(resultRow).join('')}</tbody></table></div>` : '<p>No quantitative comparison is available for this group.</p>'}
${list(group.limitations).length ? `<details class="validation-limitations" open><summary>Limits of this comparison</summary><ul>${group.limitations.map(item => `<li>${e(item)}</li>`).join('')}</ul></details>` : ''}
${list(group.sources).length ? `<p class="validation-sources">${group.sources.map(sourceLink).join(' · ')}</p>` : ''}</section>`;
}

/** Render an audit of selected endpoints, never a blanket biological pass. */
export function validationContent(report = {}) {
  return `<div class="validation-report"><h2>Experimental validation</h2><p class="validation-version">Model ${e(report.modelVersion || 'version unspecified')} · endpoint-specific evidence audit</p>
<div class="callout"><p>${e(report.scope || 'Selected model outputs are compared with published experiments. This does not validate the whole brain or human cognition.')}</p><p>Published observations, derived comparisons and simulated outputs are distinct. Calibration data cannot also establish independent validation. Unknown or unsupported outcomes remain visible.</p></div>
<p>Previous and current columns compare model revisions under the stated benchmark conditions. They are separate from the live experiment. Experimental uncertainty describes the source study; it is not a model prediction interval. A smaller error alone does not establish accurate transfer to another preparation or to humans.</p>
${list(report.groups).map(groupContent).join('')}
<section class="validation-coverage"><h3>What remains unvalidated</h3>${list(report.coverage).length ? `<dl>${report.coverage.map(item => `<div><dt>${e(item.layer || 'Model layer')} <span class="validation-status">${e(item.status || 'Not evaluated')}</span></dt><dd>${e(item.detail || 'No matching experimental comparison is available.')}</dd></div>`).join('')}</dl>` : '<p>No further layers have an experimental comparison in this report.</p>'}<p>These comparisons do not establish treatment outcomes, combination safety, individual responses, subjective experiences or human consciousness.</p></section></div>`;
}
