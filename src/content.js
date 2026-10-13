/** All catalog, imported-profile and lookup content is treated as untrusted text. */
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
const e = escapeHTML;
const array = v => Array.isArray(v) ? v : [];
const compounds = catalog => Array.isArray(catalog) ? catalog : array(catalog?.compounds);
const number = v => Number.isFinite(v) ? e(Number(v.toPrecision(3))) : 'Unknown';
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

export function modelContent(catalog) {
  return `<h2>From exposure to spikes: an explicit model.</h2>
<div class="callout"><p>NeuroScope links virtual plasma exposure, an unbound brain compartment, molecular targets and a small spiking circuit. It is a computational teaching model. Its traces do not predict a person's symptoms, cognition, treatment response or the safety of a drug combination.</p></div>
<h3>Amounts, concentrations and exchange</h3>
<p>Inputs are hypothetical initial <strong>total plasma concentrations in nM</strong>, not medication doses. Plasma amount P and brain unbound-equivalent amount B are in nmol; time is in hours. The default volumes, Vp = 3 L and Vb = 1.4 L, are teaching settings rather than drug-specific distribution volumes.</p>
<code>Cp = P/Vp; Cf = f · Cp; Cb = B/Vb<br>r = f · Kp,uu · Vb/Vp; q = 1/τ<br>kBP = q/(1+r); kPB = q − kBP<br>dP/dt = −(ke + kPB)P + kBP B<br>dB/dt = kPB P − kBP B</code>
<p>For x = (P, B), each step evaluates x(t + Δt) = exp(AΔt)x(t), where A = [[−ke−kPB, kBP], [kPB, −kBP]]. Nonnegative rates give a positive amount system. With elimination disabled, P + B is conserved and equilibrium gives Cb/Cf = Kp,uu. With elimination, the ledger verifies introduced = plasma + brain + eliminated + explicitly removed amount.</p>
<p>The fixed PK step is <strong>1/240 hour (15 seconds)</strong>. Inhibitor-dependent elimination is frozen within each step: the linear propagator is exact for that step, while the changing interaction model is time-discretized. With λ = ln(2)/half-life and kBP &gt; λ, ke = λ(q−λ)/(kBP−λ) calibrates the slow eigenvalue. Otherwise the engine flags unsupported calibration and uses ke = λ.</p>
<p>Free fraction f, partition Kp,uu and equilibration τ have separate evidence labels. Curated brain partition and equilibration values are assumptions. No absorption, dose-to-exposure conversion, explicit renal filtration, tissue binding or metabolite kinetics is resolved.</p>
<h3>Binding, competition and efficacy</h3>
<code>wi = Cb,i/K*i; D = 1 + w0 + Σwi<br>θi = wi/D<br>Aorth = (w0 + Σwi εi)/D<br>Acontrol = w0/(1+w0)</code>
<p>Orthosteric ligands compete with endogenous drive w0. A partial agonist can increase or decrease activity relative to that baseline; occupancy is not a fixed blocking percentage. The scale K* may be an assay Ki or an explicitly assumed response scale. Ki, Kd, IC50 and EC50 remain distinct. Every efficacy coefficient ε is illustrative.</p>
<p>Transporters omit w0 from the denominator and report capacity 1−θorth. This general target layer does not compute individual transport cycles or infer transmitter concentration from occupancy.</p>
<code>θPAM = ΣwPAM/(1 + ΣwPAM)<br>θchannel = Σwchannel/(1 + Σwchannel)<br>A = min(1, Aorth · (1 + 2θPAM)) · (1 − θchannel)</code>
<p>PAMs and channel blockers occupy separate pools. The fixed PAM gain of 2 amplifies existing activity; it is not a measured efficacy. Channel reduction omits voltage and use dependence. Combined occupancy is the union-of-pools proxy 1−(1−θorth)(1−θPAM)(1−θchannel), not one physical binding-site fraction.</p>
<h3>Metabolic combinations</h3>
<p>Sourced CYP2D6 inhibitor and substrate identities select the represented interaction. Its magnitude uses w = Σ free inhibitor plasma / 100 nM and clearance multiplier 1−0.5w/(1+w). Both 100 nM and 0.5 are assumptions. A plausible exposure direction is not a calibrated clinical magnitude; enzyme fractions, genetics, active metabolites and adaptation are omitted.</p>
<h3>Neural milliseconds are a separate clock</h3>
<code>dv/dt = 0.04v² + 5v + 140 − u + I<br>du/dt = a(bv − u)<br>v ≥ 30 ⇒ v ← c; u ← u + d</code>
<p>The ${link(izhikevich)} point-neuron equations run at a <strong>0.25 ms neural step</strong>, using two voltage half-steps. The default circuit has 32 excitatory and 8 inhibitory units; synaptic currents decay over 5 ms and 10 ms. A matched control shares seeded background noise and topology. Rate summaries use a rolling one-second neural window.</p>
<p>Target activity changes drive hand-chosen current shifts and synaptic gains. This entire mapping is <strong>phenomenological and uncalibrated</strong>, not derived from binding assays or human electrophysiology. Simulated firing has no validated interpretation as mood, subjective intensity, cognition or a clinical effect.</p>
<p>Playback advances in fixed 0.05-second application ticks. Separate controls map those ticks to PK hours and neural milliseconds; they are not one physical timescale. Rendering and camera motion do not determine either numerical integration step.</p>
<h3>Geometry and missing kinetics</h3>
<p>PubChem structures preserve sourced coordinates and connectivity; computed conformers are not measured solution ensembles or receptor-bound poses. Anatomical meshes, vessels and neuron shapes are schematic. The BBB scene is a separate magnified scale. Circulating tracer counts and trajectories are illustrative and do not compute drug amounts.</p>
<p>Cyanocobalamin follows a qualitative carrier, cellular uptake and cofactor pathway. Entered plasma exposure is an unevolved annotation; brain concentration and kinetics remain unknown. Its available 2D drawing is never presented as a physical 3D cobalt structure.</p>
${array(catalog?.modelAssumptions).length ? `<h3>Catalog assumptions</h3><ul>${catalog.modelAssumptions.map(x => `<li>${e(x)}</li>`).join('')}</ul>` : ''}
<p>Tests establish software consistency: identity, coordinate integrity, equations, conservation and replay. They do not calibrate an entire brain. An interaction missing from this model is unrepresented, not established to be absent in biology.</p>`;
}

export function helpContent() {
  return `<h2>Explore identity, exposure and response.</h2>
<p>Choose a bundled compound or search by name, PubChem CID, molecular formula or SMILES. Use explicit search mode when automatic detection is ambiguous. A formula can match many constitutional and stereochemical isomers; select the intended result. Salt forms and stereoisomers are not automatically interchangeable.</p>
<p>PubChem supplies identity and structure, not brain-effect predictions. An uncurated result can be inspected without assigning activity. To run it as a research profile, explicitly enter target mechanism, affinity scale and required PK values with their evidence. Manual parameters remain assumptions until independently supported.</p>
<h3>Views</h3><table><tbody>${rows([
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
    ['Step','Advance one 0.05-second application tick and remain paused. PK and neural increments follow their separate clock settings.'],
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
<p>Model efficacy coefficient: ${number(t.efficacy)}. ${t.action === 'pam' ? 'The current engine uses a separate fixed PAM gain; this profile coefficient is not used as measured amplification.' : 'This coefficient is illustrative even when the binding affinity is experimentally sourced.'}</p>${t.efficacyEvidence ? evidence(t.efficacyEvidence, sources) : ''}`).join('');
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
${profile.metabolism ? `<h3>Metabolism</h3><p>Substrate pathways: ${enzymeNames(profile.metabolism.substrate)}. Inhibition: ${enzymeNames(profile.metabolism.inhibits)}.</p>${evidence(profile.metabolism.evidence,sources)}${profile.metabolism.fractionalClearanceEvidence ? evidence(profile.metabolism.fractionalClearanceEvidence,sources) : ''}` : ''}
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
  const contributionRows = contributors.map(c => { const {profile,target} = find(c); return `<tr><td>${e(c.name || profile?.name || c.id)}<br>${pill(target?.modelAssumption ? 'Assumed affinity' : target?.evidenceType)}</td><td>${e(actionNames[c.action] || c.action)}<br>${e(c.site)}</td><td>${e(target?.affinityLabel || 'K* · unverified scale')}<br>${number(c.affinityNM)} nM</td><td>${percent(c.occupancy)}</td></tr>`; }).join('');
  const notes = contributors.map(c => { const {profile,target} = find(c); return target ? `<p><strong>${e(profile.name)}:</strong> ${e(target.evidence?.note || 'Evidence not supplied.')}</p>${refs(target.evidence?.sourceIds,profile.sources)}` : ''; }).join('');
  return `<h2>${e(targetNames[state.id] || state.id)}</h2><p>${e(state.interpretation || (transporter ? 'Fractional transporter capacity.' : 'Illustrative receptor activity, distinct from occupancy.'))}</p>
<table><tbody>${rows([
    [transporter ? 'Available transport capacity' : 'Activity proxy',percent(state.activity)], ['Matched no-drug baseline',percent(state.baselineActivity)],
    ['Change from baseline',`${Number.isFinite(state.delta) && state.delta > 0 ? '+' : ''}${number(Number.isFinite(state.delta) ? state.delta * 100 : NaN)} percentage points`],
    ['Orthosteric drug occupancy',percent(state.orthostericOccupancy)], ['Allosteric-site occupancy',percent(state.allostericOccupancy)], ['Channel-blocker occupancy',percent(state.channelOccupancy)], ['Endogenous drive w0',number(state.endogenousDrive)],
  ])}</tbody></table>
<div class="callout"><p>${transporter ? 'Capacity falls with orthosteric drug occupancy in a substrate-free approximation. This number does not compute transmitter concentration.' : 'Occupancy and activation differ. Partial agonists can raise or lower activity against endogenous drive. PAMs amplify existing activity at a separate site; channel blockers reduce it separately.'} Efficacy and target-to-network coupling coefficients are illustrative.</p></div>
${contributors.length ? `<h3>Contributors at the current modeled brain exposure</h3><table><thead><tr><th>Compound / evidence</th><th>Action / site</th><th>Affinity scale</th><th>Site occupancy</th></tr></thead><tbody>${contributionRows}</tbody></table><p>Fractions from separate site pools cannot be added as one physical site occupancy. A zero-occupancy contributor may simply have zero current modeled brain exposure.</p>${notes}` : '<p>No selected compound contributes a supported mechanism here. Activity follows endogenous baseline; unlisted interactions remain outside the model.</p>'}`;
}

export function sourcesContent(catalog) {
  const sources = unique([...array(catalog?.sources), ...compounds(catalog).flatMap(p => array(p.sources)), izhikevich]);
  return `<h2>Evidence you can trace.</h2><p>Molecular identity, assay affinity, parameter assumptions and illustrative neural coupling are separate claims. A source supports its stated evidence; it does not validate the whole simulation. Sources below are deduplicated by URL.</p>
${catalog?.retrieved ? `<p>Catalog retrieval: ${e(catalog.retrieved)}.</p>` : ''}
<div class="callout"><p>Published Ki values retain their assay context. Illustrative K* scales, efficacy coefficients and assumed brain-distribution parameters are identified in each profile. Unknown values stay unknown. PubChem provides computed conformers or explicitly labeled 2D drawings.</p></div>
<ol>${sources.map(s => `<li><p>${link(s)}${s.type ? `<br>${e(s.type)}` : ''}</p></li>`).join('')}</ol>
<p>The Izhikevich paper supports reduced spiking equations. The drug-to-circuit mapping is this app's modeling choice, not a finding of that paper. Biological sources and software tests do not establish clinical predictive accuracy.</p>`;
}
