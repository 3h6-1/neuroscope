/** All catalog, imported-profile and lookup content is treated as untrusted text. */
import { DIAZEPAM_NEURAL_CALIBRATION, diazepamInhibitionDecay } from './neural-evidence.js';
import { interactionProfileEvidence } from './interaction-evidence.js';
import { REGIONAL_ATLAS } from './regional-evidence.js';
import { PET_VALIDATION_EVIDENCE } from './pet-occupancy.js';
import neuralValidation from '../public/data/validation-neural.json' with { type: 'json' };
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
const e = escapeHTML;
const array = v => Array.isArray(v) ? v : [];
const compounds = catalog => Array.isArray(catalog) ? catalog : array(catalog?.compounds);
const number = v => Number.isFinite(v) ? e(Number(v.toPrecision(3))) : 'Unknown';
const referenceNumber = v => Number.isFinite(v) ? e(Number(v.toPrecision(6))) : 'Unknown';
const percent = v => Number.isFinite(v) ? `${number(v * 100)}%` : 'Unknown';
const pill = text => `<span class="evidence-pill">${e(text || 'Evidence unspecified')}</span>`;
const actionNames = { inhibitor:'Transporter inhibition', antagonist:'Antagonism', agonist:'Agonism', partial_agonist:'Partial agonism', pam:'Positive allosteric modulation', channel_blocker:'Channel blockade', cofactor:'Cofactor pathway' };
const targetNames = { SERT:'Serotonin transporter · SERT', DAT:'Dopamine transporter · DAT', NET:'Noradrenaline transporter · NET', D2:'Dopamine D2 receptor', HT2A:'Serotonin 5-HT2A receptor', HT1A:'Serotonin 5-HT1A receptor', GABAA:'GABAA receptor', NMDA:'NMDA receptor', ADENOSINE:'Adenosine receptors · lumped A1/A2A', NACHR:'Nicotinic acetylcholine receptor · α4β2' };
const izhikevich = { id:'izhikevich-2003', title:'Izhikevich (2003), Simple Model of Spiking Neurons', url:'https://www.izhikevich.org/publications/spikes.pdf' };
function safeURL(value) {
  try { const u = new URL(String(value)); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
function link(source) {
  const title = e(source?.title || source?.id || 'Source'), url = safeURL(source?.url);
  return url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${title} ↗</a>` : title;
}
function unique(sources) {
  const seen = new Set();
  return array(sources).filter(s => { const key = safeURL(s?.url) || String(s?.id || s?.title || ''); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
function refs(ids, sources) {
  const found = unique(array(ids).map(id => array(sources).find(s => s.id === id)).filter(Boolean));
  return found.length ? `<p class="field-note">${found.map(link).join(' · ')}</p>` : '';
}
function evidence(value, sources) {
  if (typeof value === 'string') return `<p>${pill('User-supplied note')} ${e(value)}</p>`;
  return `<p>${pill(value?.type)} ${e(value?.note || 'Evidence not supplied; treat this parameter as unverified.')}</p>${refs(value?.sourceIds, sources)}`;
}
const rows = entries => entries.map(([name, html]) => `<tr><th>${e(name)}</th><td>${html}</td></tr>`).join('');

export function regionalEvidenceContent(region = {}) {
  const provenance = region.regionalEvidence || {}, byTarget = provenance.evidenceByTarget || {};
  const targets = Object.keys(targetNames);
  const supported = targets.filter(id => byTarget[id]?.type === 'pet-derived').length;
  return `<h2>${e(region.name || 'Regional model')} · target evidence</h2>
<p>${pill(`${supported} of ${targets.length} target weights use PET references`)} ${pill('Population response remains estimated')}</p>
<div class="callout"><p>Published group-average PET maps inform relative target distribution. The displayed sensitivity weights are dimensionless transformations, not measured receptor density, firing-rate changes or an individual brain scan. Atlas-to-model mapping, normalization and target-to-population effects remain modeling choices.</p></div>
<p>${e(provenance.summary || region.densityEvidence || 'No matched empirical regional reference is available.')}</p>
${targets.map(id => {
    const item = byTarget[id] || {}, empirical = item.type === 'pet-derived';
    const weight = item.weight ?? region.receptorDensities?.[id];
    const atlas = array(item.atlasRegions).map(r => `${r.hemisphere ? `${r.hemisphere} · ` : ''}${r.label || r.index}`).join('; ');
    return `<details class="regional-evidence"><summary><strong>${e(targetNames[id])}</strong><span>${number(weight)} × · ${empirical ? 'PET-derived relative proxy' : 'Estimated fallback'}</span></summary>
<table><tbody>${rows([
      ['Model sensitivity weight',`${number(weight)} · dimensionless`],
      ['Evidence status',e(empirical ? 'PET-derived proxy; transformation estimated' : 'Estimated sensitivity; no matched PET value')],
      ...(Number.isFinite(item.rawValue) ? [['Atlas reference parcel mean',`${referenceNumber(item.rawValue)} ${e(item.rawUnits || '')}`]] : []),
      ...(item.parameter ? [['Measured parameter',e(item.parameter)]] : []),
      ...(atlas ? [['Matched atlas region(s)',e(atlas)]] : []),
      ...(item.tracer ? [['PET tracer',e(item.tracer)]] : []),
      ...(item.sampleSize ? [['Source participants',number(item.sampleSize)]] : []),
      ...(item.normalization ? [
        ['Normalization · estimated',e(item.normalization.formula || item.normalization)],
        ...(Number.isFinite(item.normalization.denominator) ? [['Reference mean',`${referenceNumber(item.normalization.denominator)} ${e(item.rawUnits || '')}`]] : []),
        ...(item.normalization.reference ? [['Reference parcels',e(item.normalization.reference)]] : []),
      ] : []),
      ...(item.mappingNote ? [['Mapping assumption',e(item.mappingNote)]] : []),
    ])}</tbody></table>
${array(item.limitations).length ? `<ul>${item.limitations.map(note => `<li>${e(note)}</li>`).join('')}</ul>` : `<p>No validated conversion from this sensitivity weight to human neuronal activity is available.</p>`}
${item.sourceUrl ? `<p>${link({id:item.sourceId,title:item.sourceTitle,url:item.sourceUrl})}${item.dataUrl ? ` · ${link({title:'Original atlas data',url:item.dataUrl})}` : ''}</p>` : ''}</details>`;
  }).join('')}
<p>Different tracers and measurement scales cannot be compared as absolute target abundance. Schematic coordinates, network connections, response signs and gains, and cognitive mappings remain uncalibrated estimates. An atlas reference supplies spatial information; it does not establish a drug's regional clinical effect.</p>
<p class="field-note">${e(REGIONAL_ATLAS.attribution)} ${link({title:`Atlas data license: ${REGIONAL_ATLAS.license}`,url:REGIONAL_ATLAS.licenseUrl})}.</p>`;
}

function inhibitionAssayContent(assay, sources) {
  return `<div class="interaction-parameter"><p><strong>${e(assay.enzyme || 'Enzyme')} · ${e(assay.compoundId || 'Inhibitor')}</strong></p>
${assay.system ? `<p>${e(assay.system)}${assay.species ? ` · ${e(assay.species)}` : ''}.</p>` : ''}
${Number.isFinite(assay.freePlasmaNM) ? `<p>Current free parent plasma proxy: ${referenceNumber(assay.freePlasmaNM)} nM.</p>` : ''}
<table><tbody>${array(assay.components).map(component => rows([
    ['Assayed component',e(component.label || assay.compoundId)],
    ['Measured nominal inhibition Ki',`${referenceNumber(component.kiNM)} nM`],
    ...(Number.isFinite(component.microsomalUnboundFraction) ? [['Microsomal unbound fraction',number(component.microsomalUnboundFraction)]] : []),
    ...(Number.isFinite(component.kiNM) && Number.isFinite(component.microsomalUnboundFraction) ? [['Derived unbound Ki',`${referenceNumber(component.kiNM * component.microsomalUnboundFraction)} nM`]] : []),
    ...(component.bindingEvidence ? [['Binding-correction evidence',e(component.bindingEvidence)]] : []),
    ...(Number.isFinite(component.parentFraction) ? [['Assumed share of unbound parent',percent(component.parentFraction)]] : []),
    ...(component.fractionEvidence ? [['Parent-mixture evidence',e(component.fractionEvidence)]] : []),
  ])).join('')}</tbody></table>
${array(assay.assumptions).length ? `<ul>${assay.assumptions.map(note => `<li>${e(note)}</li>`).join('')}</ul>` : ''}${refs(assay.sourceIds,sources)}</div>`;
}

function clearanceModelContent(model = {}, sources) {
  return `<div class="interaction-parameter"><p>${pill('Clearance fraction derived under assumptions')}</p><table><tbody>${rows([
    ...(model.enzyme ? [['Enzyme',e(model.enzyme)]] : []),
    ['Modeled fraction metabolized',percent(model.fraction)],
    ...(Number.isFinite(model.observedAUCR) ? [['Study AUC ratio used for derivation',`${number(model.observedAUCR)} ×`]] : []),
    ...(array(model.derivedFractionStudyInterval).length === 2 ? [['Transformed study interval',`${percent(model.derivedFractionStudyInterval[0])}–${percent(model.derivedFractionStudyInterval[1])}; sampling uncertainty only, not total model uncertainty`]] : []),
  ])}</tbody></table><p>The conversion f<sub>m</sub> = 1 − 1 / AUC ratio assumes complete pathway inhibition and unchanged bioavailability. It is not a direct measurement of the fraction cleared in this virtual exposure.</p>
${array(model.assumptions).length ? `<ul>${model.assumptions.map(note => `<li>${e(note)}</li>`).join('')}</ul>` : ''}${refs(model.sourceIds,sources)}</div>`;
}

export function interactionReferenceContent(reference = {}) {
  return `<article class="interaction-card observed-reference"><span class="evidence-badge">OBSERVED HUMAN STUDY</span><h3>${e(reference.title || 'Published interaction reference')}</h3>
<p><strong>${e(reference.endpoint || 'Study endpoint')}: ${e(reference.result || 'See source')}</strong></p>
${reference.regimen ? `<p><strong>Study regimen:</strong> ${e(reference.regimen)}</p>` : ''}
${reference.population ? `<p><strong>Participants:</strong> ${e(reference.population)}</p>` : ''}
<p>${e(reference.applicability || 'Study observation, not current-mixture prediction.')} Different regimens and omitted metabolites can make this differ substantially from the calculated parent-only estimate.</p>
${refs(reference.sourceIds,reference.sources)}</article>`;
}

export function interactionEvidenceContent(entry = {}, catalog) {
  const profiles = compounds(catalog), names = id => profiles.find(p => p.id === id)?.name || id;
  const modeled = entry.modeled !== false && Number.isFinite(entry.clearanceFactor);
  const legacy = entry.evidenceType === 'legacy estimate';
  return `<article class="interaction-card"><span class="evidence-badge assumed">${modeled ? legacy ? 'LEGACY ESTIMATED CLEARANCE' : 'ASSAY-INFORMED ESTIMATE' : 'QUANTITATIVE EFFECT UNMODELED'}</span><h3>${e(entry.enzyme || 'Metabolic')} clearance</h3>
<p>${e(array(entry.inhibitorIds).map(names).join(' + '))} → ${e(names(entry.substrateId))}</p>
<p>${modeled ? `Modeled total clearance: <strong>${percent(entry.clearanceFactor)}</strong> of its uninhibited value.` : 'No clearance multiplier is assigned to this pair; missing parameters do not mean no interaction.'} ${e(entry.evidence || '')}</p>
${entry.partial ? `<p><strong>Incomplete mixture:</strong> ${e(array(entry.unmodeledInhibitorIds).map(names).join(' + '))} ${array(entry.unmodeledInhibitorIds).length === 1 ? 'has' : 'have'} no matched quantitative inhibition model. The displayed factor excludes those contributions.</p>` : ''}
${array(entry.assays).length || entry.clearanceModel ? `<details data-interaction-detail="${e([entry.substrateId,entry.enzyme,...array(entry.inhibitorIds)].join(':'))}"><summary>Inspect parameters &amp; remaining estimates</summary>${array(entry.assays).map(assay => inhibitionAssayContent(assay,entry.sources)).join('')}${entry.clearanceModel ? clearanceModelContent(entry.clearanceModel,entry.sources) : ''}</details>` : ''}
<p class="field-note">Free parent plasma is used as an estimated enzyme-site exposure. Active metabolites, time-dependent inhibition and individual variation are not resolved.</p></article>`;
}

function metabolismProfileContent(profile, sources) {
  const value = interactionProfileEvidence(profile);
  const joinedSources = unique([...sources,...array(value?.sources)]);
  if (!value) return '';
  return `${array(value.inhibitionAssays).map(assay => inhibitionAssayContent(assay,joinedSources)).join('')}
${array(value.clearanceModels).map(model => clearanceModelContent(model,joinedSources)).join('')}
${array(value.clinicalReferences).length ? `<h3>Observed human interaction references</h3><p>These observations retain their study regimen and do not set the current mixture's exposure multiplier. Parent-only calculations can substantially underrepresent effects mediated by active metabolites.</p>${value.clinicalReferences.map(reference => interactionReferenceContent({...reference,sources:unique([...joinedSources,...array(reference.sources)])})).join('')}` : ''}`;
}

function functionalAssayContent(assay, sources, {custom = false, concentrationNM, assayResponse} = {}) {
  if (!assay || typeof assay !== 'object') return '';
  const hasSources = array(assay.sourceIds).some(id => array(sources).some(source => source.id === id));
  const status = custom ? 'User-supplied assay hypothesis' : hasSources ? 'Sourced functional assay' : 'Unverified assay parameters';
  const maximumLabel = assay.kind === 'potentiation' ? 'Maximum potentiation increment' : ['uptake_inhibition','channel_inhibition'].includes(assay.kind) ? 'Maximum inhibition' : 'Maximum assay response';
  return `<section class="assay-evidence"><p>${pill(status)} ${pill('Assay-to-brain mapping estimated')}</p>
<table><tbody>${rows([
    [assay.midpointType || 'Response midpoint',`${number(assay.midpointNM)} nM`],
    [maximumLabel,`${percent(assay.maxResponse)} of ${e(assay.reference || 'the stated assay reference')}`],
    ['Maximum-response evidence',e(assay.maxResponseEvidence || 'Unverified maximum; treat as an estimate until its evidence is supplied.')],
    ['Endpoint',e(assay.endpoint || 'Not supplied')],
    ['Experimental system',e(assay.system || 'Not supplied')],
    ['Species / receptor origin',e(assay.species || 'Not supplied')],
    ['Hill slope',`${number(assay.hillSlope)} · ${e(assay.hillEvidence || 'Unverified')}`],
    ...(Number.isFinite(concentrationNM) ? [['Current brain concentration proxy',`${number(concentrationNM)} nM`]] : []),
    ...(Number.isFinite(assayResponse) ? [['Calculated assay response',percent(assayResponse)]] : []),
  ])}</tbody></table>
${assay.notes ? `<p>${e(assay.notes)}</p>` : ''}
${refs(assay.sourceIds,sources)}
<p class="field-note">An assay maximum is relative to its experimental reference; it is not a universal intrinsic efficacy or a percentage change in human neuron firing. Applying this curve to the free-brain concentration proxy, background activity and mixtures is an estimated mapping.</p></section>`;
}

function petOccupancyContent(calibration, sources, state) {
  if (!calibration) return '';
  const parameterInterval = value => Number.isFinite(value?.lower) && Number.isFinite(value?.upper) ? ` · published parameter 95% CI ${referenceNumber(value.lower)}–${referenceNumber(value.upper)} ${e(value.unit || '')}` : '';
  return `<section class="assay-evidence"><h3>Human PET occupancy model</h3><p>${pill('Published model calibration')} ${pill('Conditional external comparison')}</p>
<p>Striatal D2/3 PET occupancy uses a separate effect compartment driven by total plasma concentration. This replaces the unbound-brain/Ki approximation for occupancy only. Functional activation still uses its separate cellular assay; receptor occupancy does not measure neuron firing or validate cognition.</p>
${calibration.context ? `<p>${e(calibration.context)}</p>` : ''}
<table><tbody>${rows([
    ['Occupancy EC50',`${referenceNumber(calibration.ec50NgML)} ng/mL · total-plasma-equivalent effect concentration${parameterInterval(calibration.ec50Uncertainty)}`],
    ['Effect equilibration rate',`${referenceNumber(calibration.effectRatePerHour)} h⁻¹${parameterInterval(calibration.effectRateUncertainty)}`],
    ['Maximum occupancy',`${percent(calibration.maximum)} · ${e(calibration.maximumEvidence || 'Maximum provenance not supplied')}`],
    ...(state ? [['Current effect compartment',`${referenceNumber(state.effectSiteNgML)} ng/mL`],['Single-compound occupancy estimate',percent(state.petSingleCompoundOccupancy)]] : []),
  ])}</tbody></table>
<p>dC<sub>e</sub>/dt = k<sub>e0</sub>(C<sub>plasma</sub> − C<sub>e</sub>); occupancy = maximum × C<sub>e</sub>/(EC50 + C<sub>e</sub>). C<sub>e</sub> is a response-delay state, not a measured brain tissue concentration. The clinical curve already incorporates baseline endogenous competition. Parameter confidence intervals are not individual prediction intervals.</p>
<p>Independent PET group means are compared under the conditional assumption C<sub>e</sub> ≈ C<sub>plasma</sub>. Missing plasma histories prevent validation of the full transient response. Mixtures, extra-striatal transfer, metabolites and neural/cognitive effects remain unvalidated. Open <strong>Validation</strong> for observed values and residual errors.</p>${refs(calibration.sourceIds,sources)}</section>`;
}

function neuralTransferContent() {
  const acute = neuralValidation.benchmarks.find(item => item.id === 'diazepam-acute-cortex-chapman-2025');
  const amygdala = neuralValidation.benchmarks.find(item => item.id === 'diazepam-amygdala-geracitano-2012');
  const predicted = 100 * (diazepamInhibitionDecay(acute.concentrationNM).inhibitionDecayMs / diazepamInhibitionDecay(0).inhibitionDecayMs - 1);
  return `<div class="callout"><p><strong>Independent transfer discrepancies:</strong> at ${number(acute.concentrationNM)} nM, this curve predicts a ${number(predicted)}% decay increase. Independent cortical recordings report ${number(acute.observed.mean)} ± ${number(acute.observed.sem)}% SEM; a mouse amygdala study gives a ${number(amygdala.observed.mean)}% increase derived from group means. These are different preparations and decay endpoints; the mismatches remain visible rather than being fitted away.</p><p><strong>Chronic tolerance is not modeled.</strong> The concentration-only curve cannot reproduce exposure-history effects. Open <strong>Validation</strong> for the observations, uncertainties and residuals.</p><p>${neuralValidation.sources.map(source => link({title:source.citation,url:source.url})).join(' · ')}</p></div>`;
}

function neuralReferenceContent() {
  const calibration = DIAZEPAM_NEURAL_CALIBRATION;
  return `<h3>Diazepam: direct synaptic reference</h3><p>${pill('Measured rat-culture endpoints')} ${pill('Circuit transfer estimated')}</p>
<p>${e(calibration.preparation)} ${e(calibration.endpoint)}</p>
<table><thead><tr><th>Bath concentration</th><th>Measured duration, mean ± SD</th><th>Cells</th></tr></thead><tbody>${calibration.points.map(p => `<tr><td>${number(p.concentrationNM)} nM</td><td>${number(p.durationMs)} ± ${number(p.sdMs)} ms</td><td>${number(p.cells)}</td></tr>`).join('')}</tbody></table>
<p>${link({title:calibration.citation,url:calibration.sourceUrl})}</p>
<p>${e(calibration.transformation)} ${e(calibration.transferAssumption)}</p>
<p>Intermediate durations use an estimated interpolation: linear below 10 nM, linear in log concentration between measured nonzero points. Above 1,000 nM the last value is held and labeled outside the measured range. An unmatched GABA<sub>A</sub> drug or mixture uses the estimated fallback instead of extending this single-drug experiment. The circuit does not also apply the generic GABA gain to this calibrated pathway.</p>${neuralTransferContent()}`;
}

export function neuralEvidenceContent(modulation = {}, migrationNote) {
  const value = modulation.inhibitionEvidence || {};
  const statuses = {
    'measured-endpoint-derived-tau':'Measured endpoint · derived τ',
    'reference-baseline-derived-tau':'Reference baseline · derived τ',
    'estimated-low-concentration-interpolation':'Estimated concentration interpolation',
    'estimated-log-concentration-interpolation':'Estimated concentration interpolation',
    'capped-outside-measured-range':'Outside measured range · value capped',
    'estimated-unmatched-gabaa-effect':'Estimated GABA effect · no matched calibration',
    'legacy-estimated-current-modulation':'Legacy estimated circuit settings',
  };
  return `<span>INHIBITORY SYNAPTIC DECAY</span><p><strong>${number(modulation.inhibitionDecayMs)} ms</strong> · equivalent exponential τ</p><p>${pill(statuses[value.status] || 'Evidence not supplied')}</p>
${Number.isFinite(value.concentrationNM) ? `<p>Brain concentration proxy: ${number(value.concentrationNM)} nM.</p>` : ''}
<p>Rat-culture reference; transfer to this circuit is estimated. Independent cortical and amygdala recordings show smaller diazepam decay changes than this curve. Chronic tolerance is not modeled. See <strong>Validation</strong> for those discrepancies.</p><p>Other current gains and population-response mappings remain estimated. Selected regional target weights use PET references; they do not validate firing or cognition.</p>${migrationNote ? `<p class="migration-note"><strong>Imported experiment:</strong> ${e(migrationNote)}</p>` : ''}`;
}

export function modelContent(catalog) {
  return `<h2>From exposure to regional activity and a workspace.</h2>
<div class="callout"><p>NeuroScope links virtual plasma exposure, an unbound brain compartment, molecular targets, a spiking circuit, 30 regional population models, and an explicit memory-and-association workspace. It is a computational teaching model. Its traces do not predict a person's symptoms, cognition, treatment response or the safety of a drug combination.</p></div>
<p>Open <strong>Validation</strong> in the header to compare selected outputs with published observations. The report separates conditional human PET comparisons, neural preparation-transfer discrepancies, literature-reconstructed enzyme diagnostics and unsupported chronic responses. Calibration agreement and software tests are not independent biological validation.</p>
<h3>Anatomy and regional dynamics</h3>
<p>The <strong>Internal anatomy</strong> layer adds schematic deep structures, separate pituitary lobes, ventricular spaces, brainstem subdivisions and cervical cord. Select a structure for its source and function. The <strong>Hormone pathways</strong> inspector explains portal versus axonal signaling and endocrine feedback; no hormone concentrations or drug-induced endocrine responses are computed. <strong>Regional activity</strong> remains a separate reduced network.</p>
<p>The cortical surface uses the MRI-derived fsaverage5 reference mesh distributed by Nilearn. Its folds are anatomical geometry. The 30 nonsensory functional nodes and 132 connections are schematic, not registered patient anatomy or a measured connectome. Primary sensory processing is excluded from the dynamics; the intact reference surface still includes those anatomical areas.</p>
<code>τE dE/dt = −E + σ(10gE E − 8gI I + delayed input + drive + bias + noise − 2.8)<br>τI dI/dt = −I + σ(8gE E − 3I + 0.4 + 0.25drive + bias + 0.7noise − 2.8)<br>σ(x) = 1/(1 + exp(−x))</code>
<p>Wilson–Cowan-style excitatory/inhibitory populations use τE = 20 ms, τI = 10 ms and a 0.5 ms integration step, with delayed interregional input. Target activity modifies regional gains and biases. Selected relative target weights are derived from group-average human PET atlas values; the conversion into population response remains estimated. The comparison disables direct drug effects while sharing the current cognitive drive and noise: it is not an independent untreated brain.</p>
<h3>Regional receptor evidence</h3>
<p>Select a brain region and choose <strong>Inspect regional evidence</strong> to see all ten target weights, their original atlas measurement, tracer, participants, mapped atlas parcels and normalization. PET-derived weights describe relative spatial distribution. They are not direct measurements of neuronal sensitivity, and values from different tracers are not comparable as absolute receptor abundance.</p>
<p>The atlas-to-model region mapping and normalization are explicit modeling choices. Unmatched targets and regions keep labeled estimated fallbacks; negative or unsupported PET signals are not silently converted into positive receptor density. Schematic network connections, response gains and signs, regional concentration differences, and cognitive mappings remain uncalibrated.</p>
<h3>The inspectable workspace</h3>
<p>Text enters directly as symbols, bypassing modeled senses. Memory retrieval uses lexical similarity, strength and recency. Seeded candidate selection creates associations every two playback seconds. The journal exposes candidate scores, selection probabilities, retained memories and explicit attention, retention, flexibility and inhibition parameters. These are program variables, not measured psychological scores or human thoughts.</p>
<p>Regional activity changes those parameters through documented, unvalidated mappings. This changes memory selection and internal drive. It does not simulate consciousness, full human reasoning, or a person's subjective drug experience.</p>
<h3>Conversation is a separate component</h3>
<p>The default state inspector answers questions about the current model deterministically. An optional WebLLM model supports open-ended language in a browser with WebGPU after an explicit model download. It receives a captured state and conversation context; its language ability does not emerge from these simulated neurons. An assumed sampling temperature of 0.2 + 0.6 × flexibility conditions its output. Response provenance records that input state and sampling rule. Neither language-model internals nor private reasoning are exposed.</p>
<p>Drug mixtures retain their modeled target competition and PK interactions. Unknown mechanisms, chronic adaptations, metabolites and whole-brain effects are not invented. See the repository's Brain Model and Dialogue documents for the full equations and limits.</p>
<h3>Amounts, concentrations and exchange</h3>
<p>Inputs are hypothetical initial <strong>total plasma concentrations in nM</strong>, not medication doses. Plasma amount P and brain unbound-equivalent amount B are in nmol; time is in hours. The default volumes, Vp = 3 L and Vb = 1.4 L, are teaching settings rather than drug-specific distribution volumes.</p>
<code>Cp = P/Vp; Cf = f · Cp; Cb = B/Vb<br>r = f · Kp,uu · Vb/Vp; q = 1/τ<br>kBP = q/(1+r); kPB = q − kBP<br>dP/dt = −(ke + kPB)P + kBP B<br>dB/dt = kPB P − kBP B</code>
<p>For x = (P, B), each step evaluates x(t + Δt) = exp(AΔt)x(t), where A = [[−ke−kPB, kBP], [kPB, −kBP]]. Nonnegative rates give a positive amount system. With elimination disabled, P + B is conserved and equilibrium gives Cb/Cf = Kp,uu. With elimination, the ledger verifies introduced = plasma + brain + eliminated + explicitly removed amount.</p>
<p>The fixed PK step is <strong>1/240 hour (15 seconds)</strong>. Inhibitor-dependent elimination is frozen within each step: the linear propagator is exact for that step, while the changing interaction model is time-discretized. With λ = ln(2)/half-life and kBP &gt; λ, ke = λ(q−λ)/(kBP−λ) calibrates the slow eigenvalue. Otherwise the engine flags unsupported calibration and uses ke = λ.</p>
<p>Free fraction f, partition Kp,uu and equilibration τ have separate evidence labels. Most brain-partition settings and all equilibration settings remain estimated. A rat bupropion Kp,uu value fitted to microdialysis data supplies one partition reference; transferring it to this human teaching model remains an assumption. No absorption, dose-to-exposure conversion, explicit renal filtration, tissue binding or metabolite kinetics is resolved.</p>
<h3>Functional assay responses and binding are separate</h3>
<code>Rassay(C) = Emax · Cⁿ / (EC50ⁿ + Cⁿ)<br>For inhibition endpoints, replace EC50 with IC50.</code>
<p>Where a profile supplies functional data, the target response uses its published assay midpoint and a maximum with separate evidence. Some maxima are measured; a normalized complete-inhibition maximum is still estimated where no fitted maximum is available. Each profile lists that distinction, endpoint, experimental system, receptor origin and normalization reference. A missing Hill slope is explicitly estimated as n = 1. IC50 is an inhibition midpoint and EC50 an activation midpoint; neither is silently treated as a dissociation constant.</p>
<p>These curves reproduce a reduced assay response, not a human neuron response. Applying an in-vitro concentration to the modeled unbound brain compartment, translating its endpoint into baseline activity and combining different assays in a mixture remain <strong>estimates</strong>. They are labeled separately from the measured parameters.</p>
<code>wi = (Cb,i / midpointi)ⁿⁱ<br>Aproxy = (Abaseline + Σwi Emax,i) / (1 + Σwi)<br>Remaining transport capacity = 1 − Σwi Emax,inhibition,i / (1 + Σwi)<br>PAM multiplier = 1 + Σwi Emax,potentiation,i / (1 + Σwi)</code>
<p>The activation formula interpolates the no-drug baseline toward each assay maximum. Shared denominators are an estimated mixture rule, not measured drug-combination data. Unmeasured receptor competitors use the normalized fallback weight (C/K*)/(1+w0) and illustrative efficacy; this preserves the original baseline as a concentration approaches zero. Channel inhibition uses the remaining-capacity form. The independent assay response is displayed alongside the resulting activity proxy so the two cannot be mistaken for each other.</p>
<h3>Binding, competition and fallback efficacy</h3>
<code>wi = Cb,i/K*i; D = 1 + w0 + Σwi<br>θi = wi/D<br>Aorth = (w0 + Σwi εi)/D<br>Acontrol = w0/(1+w0)</code>
<p>Orthosteric ligands compete with estimated endogenous drive w0. A partial agonist can increase or decrease activity relative to that baseline; occupancy is not a fixed blocking percentage. Binding occupancy uses a Ki-based approximation where available; assumed K* scales remain labeled binding proxies. Legacy efficacy coefficients ε remain illustrative only where a functional assay curve is unavailable. The profile identifies which path is used.</p>
<p>A curated aripiprazole D2/3 PET pathway instead uses a published total-plasma-driven effect compartment for striatal occupancy. It retains the separate cellular functional-response curve. Its independent comparison supplies observed plasma concentrations and assumes effect-site equilibrium; it does not test the entire PK time course. See the profile for parameter provenance and <strong>Validation</strong> for remaining errors. PET occupancy does not validate firing or cognition.</p>
<p>Transporter capacity uses sourced uptake-inhibition curves when available and an occupancy-based fallback otherwise. Binding and uptake inhibition are distinct outputs. This general target layer does not compute individual transport cycles or infer transmitter concentration from occupancy.</p>
<code>θPAM = ΣwPAM/(1 + ΣwPAM)<br>θchannel = Σwchannel/(1 + Σwchannel)<br>A = min(1, Aorth · (1 + 2θPAM)) · (1 − θchannel)</code>
<p>PAMs and channel blockers occupy separate pools. The equations above describe the fallback pathway: a PAM without a functional assay uses the estimated gain of 2. Sourced functional modulation replaces that gain where supplied. Channel reduction omits voltage and use dependence. Combined occupancy is the union-of-pools proxy 1−(1−θorth)(1−θPAM)(1−θchannel), not one physical binding-site fraction.</p>
<h3>Metabolic combinations</h3>
<code>w = Σ Cfree,parent,i · parentFractioni / (Ki,i · fu,mic,i)<br>Clearance multiplier = 1 − fm + fm/(1 + w)<br>Derived fm = 1 − 1/AUC ratio</code>
<p>Matched pairs use published in-vitro inhibition Ki values and, when reported, microsomal unbound fractions. Published clinical AUC ratios supply selected pathway fractions under the explicit assumptions of complete inhibition, unchanged bioavailability and linear clearance. Those fractions are derived proxies, not directly measured values. Enantiomer shares and transfer from free plasma to the enzyme site remain estimated. Missing quantitative parameters produce an <strong>unmodeled</strong> card instead of an invented potency or an apparent absence of interaction.</p>
<p>The Interactions panel keeps <strong>observed human study references</strong> separate from the current parent-only calculation, preserving the original regimen and participants. These study ratios are not applied as multipliers to arbitrary virtual exposures. Active inhibitory metabolites, time-dependent inhibition, induction, genetic variation, first-pass changes and adaptation are not resolved. In particular, a small calculated parent-only effect does not negate a larger interaction observed in a repeated-dose human study.</p>
<h3>Neural milliseconds are a separate clock</h3>
<code>dv/dt = 0.04v² + 5v + 140 − u + I<br>du/dt = a(bv − u)<br>v ≥ 30 ⇒ v ← c; u ← u + d</code>
<p>The ${link(izhikevich)} point-neuron equations run at a <strong>0.25 ms neural step</strong>, using two voltage half-steps. The default circuit has 32 excitatory and 8 inhibitory units. A matched control shares seeded background noise and topology. Rate summaries use a rolling one-second neural window.</p>
<p><strong>Direct electrophysiology reference:</strong> the diazepam pathway changes inhibitory synaptic decay using published spontaneous inhibitory postsynaptic current (sIPSC) measurements in cultured rat neurons. The measured durations replace an arbitrary fixed inhibitory gain for that pathway. Its concentration interpolation, single-exponential approximation and transfer to this small network are estimated; this is not a human dose-response curve.</p>
${neuralReferenceContent()}
<p>Other target-to-current shifts, synaptic gains, network connectivity, unsupported regional weights and cognitive mappings remain <strong>estimated and uncalibrated</strong>. PET-supported regional weights still require estimated normalization and population coupling. A research-supported receptor endpoint does not establish how much a human neuron's firing rate changes. Simulated firing has no validated interpretation as mood, subjective intensity, cognition or a clinical effect.</p>
<p>Playback advances in fixed 0.05-second application ticks. Separate controls map those ticks to PK hours and neural milliseconds; they are not one physical timescale. Rendering and camera motion do not determine either numerical integration step.</p>
<h3>Geometry and missing kinetics</h3>
<p>PubChem structures preserve sourced coordinates and connectivity; computed conformers are not measured solution ensembles or receptor-bound poses. The brain cortex is MRI-derived; other anatomical meshes, vessels, neuron shapes, regional positions and functional connections are schematic. The BBB scene is a separate magnified scale. Circulating tracer counts and trajectories are illustrative and do not compute drug amounts.</p>
<p>Cyanocobalamin follows a qualitative carrier, cellular uptake and cofactor pathway. Entered plasma exposure is an unevolved annotation; brain concentration and kinetics remain unknown. Its available 2D drawing is never presented as a physical 3D cobalt structure.</p>
${array(catalog?.modelAssumptions).length ? `<h3>Catalog assumptions</h3><ul>${catalog.modelAssumptions.map(x => `<li>${e(x)}</li>`).join('')}</ul>` : ''}
<p>Tests establish software consistency: identity, coordinate integrity, equations, conservation and replay. They do not calibrate an entire brain. An interaction missing from this model is unrepresented, not established to be absent in biology.</p>`;
}

export function helpContent() {
  return `<h2>Explore identity, exposure and response.</h2>
<p>Choose a bundled compound or search by name, PubChem CID, molecular formula or SMILES. Use explicit search mode when automatic detection is ambiguous. A formula can match many constitutional and stereochemical isomers; select the intended result. Salt forms and stereoisomers are not automatically interchangeable.</p>
<p>PubChem supplies identity and structure, not brain-effect predictions. An uncurated result can be inspected without assigning activity. To run it as a research profile, explicitly enter target mechanism, affinity scale and required PK values with their evidence. Manual parameters remain assumptions until independently supported.</p>
<p>Choose <strong>Validation</strong> in the header or <strong>Compare with published experiments</strong> beside the live observations. Tables distinguish published measurements from previous/current model outputs, report residual errors and keep unsupported outcomes visible. These benchmarks run separately from your live experiment; PET occupancy comparisons do not validate firing or cognition.</p>
<h3>Views</h3><table><tbody>${rows([
    ['Brain & workspace','Explore the cortical surface, select regional states, toggle cutaway/connections, inspect memory and the event journal, or ask a question. The optional language model is in Conversation settings.'],
    ['Bloodstream','Explore circulation, brain and organ context. Tracer motion is illustrative.'],
    ['Blood–brain barrier','Inspect a separately magnified capillary, tight junctions, pericyte and astrocyte endfeet.'],
    ['Synapse','Inspect local schematic transmitter and target interactions.'],
    ['Neural circuit','Compare modeled excitatory/inhibitory spikes and rates with the matched control.'],
    ['Molecules','Rotate sourced ball-and-stick conformers. Explicitly labeled 2D records remain chemical drawings.'],
  ])}</tbody></table>
<h3>Controls</h3><table><tbody>${rows([
    ['Orbit / zoom / pan','Drag to orbit, scroll or pinch to zoom, right-drag or two-finger pan where supported.'],
    ['Free navigation','Use the camera control or F; drag to look. W/A/S/D move, Q/E move down/up, Shift moves faster.'],
    ['Reset perspective','Use the camera reset control or 0.'],
    ['Pause / resume','Use playback or Space. Camera navigation remains available while paused.'],
    ['Step','Advance two 0.05-second application ticks and remain paused. PK and neural increments follow their separate clock settings.'],
    ['Timeline','Seek recorded history to pause there. Resuming or editing creates a new branch and discards the old future.'],
    ['Import / export','Save an experiment JSON with its state and parameters. Import restores a compatible experiment; review imported research assumptions.'],
  ])}</tbody></table>
<p>Introduce a hypothetical initial total plasma concentration in nM. Selected compounds share modeled target competition and metabolic pathways. Removing an exposure is a simulation intervention recorded in the amount ledger; reset starts a new experiment.</p>
<p>Select a structure or target to inspect it. Target panels distinguish occupancy, activity and change from baseline. Molecular element colors, hydrogen visibility and rotation aid inspection. Molecular 3D coordinates use ångströms (1 Å = 0.1 nm); anatomical views use schematic display scales.</p>`;
}

export function profileContent(profile = {}) {
  const sources = array(profile.sources), targets = array(profile.targets), pk = profile.pk;
  const qualitative = profile.modelType === 'cofactor' || profile.qualitativeExposureSupported;
  const enzymeNames = values => array(values).map(v => e(typeof v === 'string' ? v : v?.enzyme || 'Unknown')).join(', ') || 'None represented';
  const targetDetails = targets.map(t => `<h3>${e(targetNames[t.target] || t.target)}</h3><p>${pill(t.modelAssumption ? 'Assumed affinity scale' : t.evidenceType || t.evidence?.type)} ${e(actionNames[t.action] || t.action)}${t.subtype ? ` · ${e(t.subtype)}` : ''}</p>
<p><strong>${e(t.affinityLabel || 'K* · unverified model scale')}: ${number(t.kiNM)} nM.</strong></p>${evidence(t.evidence, sources)}
${!profile.custom ? petOccupancyContent(t.occupancyCalibration,sources) : ''}
${t.functionalAssay ? functionalAssayContent(t.functionalAssay,sources,{custom:profile.custom}) : `<p>${pill('Estimated functional response')} Model efficacy coefficient: ${number(t.efficacy)}. ${t.action === 'pam' ? 'Without a functional assay, the engine uses a separate estimated PAM gain of 2; this profile coefficient is not measured amplification.' : 'This fallback coefficient is illustrative even when the binding affinity is experimentally sourced.'}</p>${t.efficacyEvidence ? evidence(t.efficacyEvidence, sources) : ''}`}`).join('');
  const pkDetails = pk ? [ ['halfLifeH','Selected half-life','h'], ['freeFraction','Unbound plasma fraction',''], ['brainPartition','Unbound partition Kp,uu',''], ['brainEquilibrationH','Equilibration τ','h'] ].map(([key,name,unit]) => `<h3>${e(name)} · ${number(pk[key])}${unit ? ` ${e(unit)}` : ''}</h3>${evidence(pk.evidence?.[key], sources)}`).join('')
    : `<div class="callout"><p>${e(profile.qualitativeExposureNote || 'No acute pharmacokinetic values are assigned. Brain concentration and time course are unknown, not assumed zero.')}</p></div>`;
  return `<h2>${e(profile.name || 'Compound profile')}</h2><p>${e(profile.class || 'Molecular identity and model evidence')}</p>
<table><tbody>${rows([
    ['PubChem CID',e(profile.cid ?? 'Unknown')], ['Formula / molar mass',`${e(profile.formula || 'Unknown')} · ${number(profile.molecularWeight)} g/mol`],
    ['Structure CID',e(profile.structureCid ?? profile.cid ?? 'Unknown')],
    ['Model status',e(qualitative ? 'Qualitative pathway; acute PK/target kinetics unsupported' : profile.simulationSupported ? 'Reduced acute PK/target model' : 'Identity/structure only until an explicit research profile is supplied')],
  ])}</tbody></table>
${array(profile.aliases).length ? `<p>Recognized names: ${profile.aliases.map(e).join(', ')}.</p>` : ''}
<div class="callout"><p>${e(profile.structureNote || 'Database geometry does not establish a receptor-bound pose or a solution-state ensemble.')}${profile.structureDimension === 2 || profile.unavailable3D ? ' This is a 2D chemical depiction; physical 3D coordinates and cobalt coordination are not inferred.' : ''}</p></div>
<h3>Target evidence</h3>${targets.length ? `${targetDetails}<p>Ki, Kd, uptake IC50 and activation EC50 are distinct. Species, assay and receptor context affect interpretation. Occupancy is not a clinical response.</p>` : `<p>${qualitative ? 'No acute neurotransmitter-receptor mechanism is assigned to this cofactor pathway.' : 'No supported target profile is supplied. Identity alone does not determine affinity or efficacy.'}</p>`}
<h3>Exposure parameters</h3>${pkDetails}${profile.defaultExposureEvidence ? `<p>${e(profile.defaultExposureEvidence)}</p>` : ''}
${profile.metabolism ? `<h3>Metabolism</h3><p>Substrate pathways: ${enzymeNames(profile.metabolism.substrate)}. Inhibition: ${enzymeNames(profile.metabolism.inhibits)}.</p>${evidence(profile.metabolism.evidence,sources)}${profile.metabolism.fractionalClearanceEvidence ? evidence(profile.metabolism.fractionalClearanceEvidence,sources) : ''}${profile.custom ? '<p>Custom metabolic parameters are unverified hypotheses; curated interaction evidence is not assigned by compound name.</p>' : metabolismProfileContent(profile,sources)}` : ''}
${targets.some(t => t.neuralCalibrationId === DIAZEPAM_NEURAL_CALIBRATION.id) ? neuralReferenceContent() : ''}
${array(profile.pathway).length ? `<h3>Qualitative cofactor pathway</h3><div class="callout"><p>These stages have no assigned durations, transport constants or neural repair rates. Plasma exposure does not establish brain delivery; this diagram does not drive an acute firing effect.</p></div><ol>${profile.pathway.map(stage => `<li><strong>${e(stage.stage)}</strong><p>${e(stage.description)}</p>${refs(stage.sourceIds,sources)}</li>`).join('')}</ol>` : ''}
${array(profile.notes).length ? `<h3>Interpretation</h3><ul>${profile.notes.map(note => `<li>${e(note)}</li>`).join('')}</ul>` : ''}
${sources.length ? `<h3>Profile sources</h3><ul>${unique(sources).map(s => `<li>${link(s)}</li>`).join('')}</ul>` : ''}`;
}

export function targetContent(state, catalog) {
  if (!state?.id) {
    const map = state?.targets || state;
    const states = map && typeof map === 'object' ? Object.values(map).filter(v => v?.id && 'activity' in v) : [];
    return states.length ? `<h2>Target activity and competition</h2>${states.map(v => targetContent(v,catalog)).join('')}` : '<h2>Target details</h2><p>Select a target to inspect occupancy, baseline and contributors.</p>';
  }
  const profiles = compounds(catalog), contributors = array(state.contributors), transporter = state.kind === 'transporter';
  const find = c => { const profile = profiles.find(p => p.id === c.id); return { profile, target:array(profile?.targets).find(t => t.target === state.id && t.action === c.action) }; };
  const contributionRows = contributors.map(c => { const {profile,target} = find(c); return `<tr><td>${e(c.name || profile?.name || c.id)}<br>${pill(c.occupancyCalibration ? 'PET occupancy model' : target?.modelAssumption ? 'Assumed affinity' : target?.evidenceType)}</td><td>${e(actionNames[c.action] || c.action)}<br>${e(c.site)}</td><td>${c.occupancyCalibration ? `PET EC50 ${referenceNumber(c.occupancyCalibration.ec50NgML)} ng/mL<br>Separate assay Ki ${number(c.affinityNM)} nM` : `${e(target?.affinityLabel || 'K* · unverified scale')}<br>${number(c.affinityNM)} nM`}</td><td>${percent(c.occupancy)}</td></tr>`; }).join('');
  const notes = contributors.map(c => { const {profile,target} = find(c); return target ? `<p><strong>${e(profile.name)}:</strong> ${e(target.evidence?.note || 'Evidence not supplied.')}</p>${refs(target.evidence?.sourceIds,profile.sources)}` : ''; }).join('');
  const functionalResponses = array(state.functionalResponses);
  const assayDetails = functionalResponses.map(response => {
    const profile = profiles.find(p => p.id === response.id);
    return `<h3>${e(response.name || profile?.name || response.id)} · functional response</h3><p>${e(response.evidenceBasis || 'Review assay provenance; transfer to brain activity remains estimated.')}</p>${functionalAssayContent(response.assay,profile?.sources,{custom:profile?.custom || response.evidenceBasis?.startsWith('User-supplied'),concentrationNM:response.concentrationNM,assayResponse:response.assayResponse})}`;
  }).join('');
  return `<h2>${e(targetNames[state.id] || state.id)}</h2><p>${e(state.interpretation || (transporter ? 'Fractional transporter capacity.' : 'Illustrative receptor activity, distinct from occupancy.'))}</p>
<table><tbody>${rows([
    [transporter ? 'Available transport capacity' : 'Activity proxy',percent(state.activity)], ['Matched no-drug baseline',percent(state.baselineActivity)],
    ['Change from baseline',`${Number.isFinite(state.delta) && state.delta > 0 ? '+' : ''}${number(Number.isFinite(state.delta) ? state.delta * 100 : NaN)} percentage points`],
    ['Orthosteric drug occupancy',percent(state.orthostericOccupancy)], ['Allosteric-site occupancy',percent(state.allostericOccupancy)], ['Channel-blocker occupancy',percent(state.channelOccupancy)], ['Endogenous drive w0',number(state.endogenousDrive)],
  ])}</tbody></table>
<div class="callout"><p><strong>Response basis:</strong> ${e(state.responseBasis || 'Estimated binding-to-activity mapping')}.</p><p><strong>Occupancy evidence:</strong> ${e(state.occupancyEvidence || 'Binding-affinity approximation or explicitly assumed binding scale')}.</p><p>${transporter ? 'Sourced uptake inhibition and binding occupancy are distinct. The capacity proxy does not compute transmitter concentration.' : 'Occupancy and activation differ. Partial agonists can raise or lower activity against endogenous drive. PAMs amplify existing activity at a separate site; channel blockers reduce it separately.'} Assay-to-brain transfer, mixture pooling and target-to-network coupling remain estimates.</p></div>
${assayDetails}
${contributors.filter(c=>c.occupancyCalibration).map(c=>petOccupancyContent(c.occupancyCalibration,profiles.find(p=>p.id===c.id)?.sources,c)).join('')}
${contributors.filter(c=>c.occupancyCalibrationUnavailable).map(c=>`<p>${e(c.occupancyCalibrationUnavailable)}</p>`).join('')}
${contributors.length ? `<h3>Contributors at the current modeled brain exposure</h3><table><thead><tr><th>Compound / evidence</th><th>Action / site</th><th>Affinity scale</th><th>Site occupancy</th></tr></thead><tbody>${contributionRows}</tbody></table><p>Fractions from separate site pools cannot be added as one physical site occupancy. A zero-occupancy contributor may simply have zero current modeled brain exposure.</p>${notes}` : '<p>No selected compound contributes a supported mechanism here. Activity follows endogenous baseline; unlisted interactions remain outside the model.</p>'}`;
}

export function sourcesContent(catalog) {
  const sources = unique([...array(catalog?.sources), ...compounds(catalog).flatMap(p => array(p.sources)),
    ...compounds(catalog).flatMap(profile => interactionProfileEvidence(profile).sources),
    ...PET_VALIDATION_EVIDENCE.sources,
    ...neuralValidation.sources.map(source => ({id:source.id,title:source.citation,url:source.url})),
    ...Object.values(REGIONAL_ATLAS.maps).map(map => ({id:map.sourceId,title:map.sourceTitle,url:map.sourceUrl})),
    {title:'Hansen et al. (2022), human neurotransmitter receptor architecture',url:REGIONAL_ATLAS.citationUrl},
    {title:`Derived regional PET dataset · ${REGIONAL_ATLAS.license}`,url:REGIONAL_ATLAS.licenseUrl}, izhikevich,
    {title:DIAZEPAM_NEURAL_CALIBRATION.citation,url:DIAZEPAM_NEURAL_CALIBRATION.sourceUrl},
    {title:'Wilson & Cowan (1972), Excitatory and inhibitory interactions in localized populations of model neurons',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC1484078/'},
    {title:'Nilearn fsaverage5 reference surfaces',url:'https://nilearn.github.io/dev/modules/description/fsaverage5.html'},
    {title:'Yeo et al. (2011), Organization of human cerebral cortex estimated by intrinsic functional connectivity',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC3174820/'},
    {title:'WebLLM browser inference documentation',url:'https://webllm.mlc.ai/docs/'}]);
  return `<h2>Evidence you can trace.</h2><p>Molecular identity, binding affinity, functional assay endpoints, synaptic recordings and estimated neural coupling are separate claims. A source supports its stated evidence; it does not validate the whole simulation. Sources below are deduplicated by URL.</p>
${catalog?.retrieved ? `<p>Catalog retrieval: ${e(catalog.retrieved)}.</p>` : ''}
<div class="callout"><p>Published Ki, functional EC50/IC50 and Emax values retain their experimental context. Profiles distinguish measured parameters from estimated Hill slopes, baseline and mixture rules, fallback efficacy, and brain-distribution settings. Selected regional target weights use human PET references, while their mapping into population activity and cognition remains estimated. Metabolic cards distinguish in-vitro Ki, clinically derived clearance fractions, and observed study outcomes from the current calculation. The circuit retains a direct rat-culture synaptic reference for diazepam. Unknown values stay unknown. PubChem provides computed conformers or explicitly labeled 2D drawings.</p></div>
<ol>${sources.map(s => `<li><p>${link(s)}${s.type ? `<br>${e(s.type)}` : ''}</p></li>`).join('')}</ol>
<p>The Izhikevich paper supports reduced spiking equations. Applying receptor-assay curves and selected rat-culture synaptic measurements to this circuit is a separate modeling choice. Biological sources and software tests do not establish clinical predictive accuracy.</p>`;
}
