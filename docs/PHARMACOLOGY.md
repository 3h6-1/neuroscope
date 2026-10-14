# Brain pharmacology simulator: model and evidence

This is a computational teaching model linking molecular identity, plasma exposure, an unbound brain compartment, selected receptor/transporter interactions and an illustrative spiking network. It is not a digital twin of a person, an all-atom brain simulation, a clinical interaction checker or a predictor of subjective effects. Cortical surfaces and selected receptor spatial maps are sourced reference data. Their anatomical mapping and drug-to-network coupling, other geometry and network wiring remain model choices, not measurements from a specific human brain.

The catalog treats each compound through the same schema and evidence rules. Pharmacology that cannot be represented by the acute model remains explicitly unsupported. Unknown values are not silently treated as measured zeros.

## Catalog, identities and structures

`public/data/compound-catalog.json` contains ten curated records. Names and salts are normalized to a specified active moiety; that does not imply that different formulations have identical absorption. Inputs are hypothetical **initial total plasma concentrations in nM**, not milligram doses.

| Compound | Canonical PubChem CID | Structure represented | Principal modeled mechanism |
| --- | --- | --- | --- |
| Escitalopram | [146570](https://pubchem.ncbi.nlm.nih.gov/compound/146570) | S-escitalopram cation, structure CID 40466954 | SERT inhibition |
| Aripiprazole | [60795](https://pubchem.ncbi.nlm.nih.gov/compound/60795) | Neutral reference conformer | D2/5-HT1A partial agonism, 5-HT2A antagonism |
| Bupropion | [444](https://pubchem.ncbi.nlm.nih.gov/compound/444) | Neutral parent, representative conformer of unspecified/racemic identity | NET/DAT inhibition |
| Cyanocobalamin | [166596686](https://pubchem.ncbi.nlm.nih.gov/compound/166596686) | Explicit B12 form; 2D depiction only | Qualitative carrier/cofactor pathway |
| LSD / lysergide | [5761](https://pubchem.ncbi.nlm.nih.gov/compound/5761) | Specified d-lysergide stereoisomer | 5-HT2A/5-HT1A agonism |
| Caffeine | [2519](https://pubchem.ncbi.nlm.nih.gov/compound/2519) | Neutral reference conformer | Lumped adenosine antagonism |
| Nicotine | [89594](https://pubchem.ncbi.nlm.nih.gov/compound/89594) | S-nicotine reference conformer | α4β2 nicotinic receptor agonism |
| Diazepam | [3016](https://pubchem.ncbi.nlm.nih.gov/compound/3016) | Neutral reference conformer | GABAA positive allosteric modulation |
| Ketamine | [3821](https://pubchem.ncbi.nlm.nih.gov/compound/3821) | Neutral parent, representative conformer of unspecified/racemic identity | NMDA channel blockade |
| Fluoxetine | [3386](https://pubchem.ncbi.nlm.nih.gov/compound/3386) | Neutral parent, representative conformer of unspecified/racemic identity | SERT inhibition |

The structure file `public/data/compound-structures.json` contains atoms, elements, explicit hydrogens, formal charges, bond connectivity and source coordinates. The nine 3D records were fetched from the PubChem PUG REST endpoint:

```text
https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{CID}/record/JSON?record_type=3d
```

Each record retains the source URL, SHA-256 checksums of JSON and SDF data, retrieval date, coordinate type and original centering translation. Coordinates are translated rigidly to their arithmetic centroid. They are not embedded or force-field minimized by this program, and no downloaded 2D layout is promoted to a molecular 3D conformer. Retrieval date: **October 13, 2026**.

A PubChem conformer is a computed geometry, not a measured solution ensemble or receptor-bound pose. Apart from the explicitly protonated escitalopram reference, neutral parent structures are shown without asserting that neutral molecules predominate in physiological fluid. Acid–base equilibria, solvent and conformational ensembles are not integrated. Rendered ball radii are display conventions, not a calibrated solvent-accessible surface.

The escitalopram structure's formula is C20H22FN2O⁺, whereas its catalog formula and molecular weight describe the neutral parent. That distinction is explicit through `cid`, `structureCid` and `structureNote`.

Bupropion hydrochloride aliases resolve to bupropion. Chloride is not rendered as another neuroactive compound. Ketamine means the racemic/unspecified parent; esketamine is not substituted. “B12” resolves explicitly to **cyanocobalamin**, and other cobalamins are not treated as chemically interchangeable identities.

### Stereochemistry

RDKit independently assigned stereochemistry from the downloaded SDF coordinates, replacing existing stereo tags before assigning CIP labels. Escitalopram is S, nicotine is S and lysergide has the two R centers of the specified parent record. The assets retain CIP-ordered neighbor indices and signed triple products:

```text
χ = det(r₁−r₄, r₂−r₄, r₃−r₄)
```

Here 1–4 are descending CIP priority, not arbitrary atom order. This detects reflection or flattening after the chemically correct ordering is established; the sign alone is not a CIP algorithm.

Bupropion, ketamine and fluoxetine parent identities do not specify an enantiopure product. Their one downloaded conformer has a particular handedness, but it is stored as `representativeConformerCenters` rather than a catalog stereochemical claim. A single conformer cannot depict an ensemble containing both enantiomers simultaneously.

### Cyanocobalamin structure limitation

PubChem's current canonical cyanocobalamin record does not supply a computed 3D conformer, including because of its size, cobalt chemistry and unsupported force-field representation. The file therefore has `dimension: 2`, `unavailable 3D: true` and `units: "2D depiction units"`. Its coordinates are a chemical drawing, not ångström measurements. All z coordinates are zero. The disconnected chemical components reflect the database representation; no cobalt coordination geometry is invented. Older references may use CID 5311498; the current fetched identity is CID 166596686.

## Evidence classification

Every target has `evidenceType`, `modelAssumption`, `affinityLabel` and evidence source IDs. The numeric field is named `kiNM` for engine compatibility; when it is illustrative, the user-facing quantity is **K\***, not an experimentally measured Ki.

| Mechanism | Numeric scale used | Status |
| --- | --- | --- |
| Escitalopram SERT | 1.1 nM | Human transporter radioligand binding Ki; [Owens et al.](https://pubmed.ncbi.nlm.nih.gov/11543737/) |
| Aripiprazole D2 / 5-HT1A / 5-HT2A | 0.34 / 1.7 / 3.4 nM | Binding Ki values reported in the [product label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=569f1c32-fb6f-c34f-0894-4b1e7b744a8a) |
| Bupropion NET / DAT | 1900 / 1000 nM | Illustrative K\*; NET uses the reported 1.9 µM uptake IC50 only as a response scale, **not an IC50-to-Ki conversion**; [primary study](https://pubmed.ncbi.nlm.nih.gov/15322260/) |
| LSD 5-HT2A / 5-HT1A | 14.7 / 9.5 nM | One recombinant human receptor binding experiment; other assays differ; [primary study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9191647/) |
| Caffeine adenosine | 10,000 nM | Illustrative K\* for a lumped A1/A2A target. Human occupancy is documented separately for [A1](https://jnm.snmjournals.org/content/53/11/1723) and [A2A](https://pubmed.ncbi.nlm.nih.gov/35001424/); this number is not fitted to those PET studies. |
| Nicotine α4β2 | 2 nM | Representative human α4β2 binding Ki, recorded with assay information in [IUPHAR/BPS](https://www.guidetopharmacology.org/GRAC/LigandActivityRangeVisForward?ligandId=2585) |
| Diazepam GABAA | 10 nM | Illustrative benzodiazepine-site K\*; the mechanism is [GABA-dependent positive modulation](https://pubmed.ncbi.nlm.nih.gov/9014155/). |
| Ketamine NMDA | 500 nM | Illustrative K\*; [NMDA studies](https://pmc.ncbi.nlm.nih.gov/articles/PMC5641405/) do not establish a universal voltage-/subunit-independent affinity. |
| Fluoxetine SERT | 1 nM | Rounded illustrative K\*, supported qualitatively by [human transporter binding research](https://pubmed.ncbi.nlm.nih.gov/9537821/) |

Ki, Kd, IC50 and EC50 are distinct. Species, receptor subtype, radioligand, substrate concentration, receptor state and assay pathway affect measured values. A receptor binding Ki does not determine channel-activation EC50 or a clinical response. The table above records the binding layer; aripiprazole D2 occupancy additionally uses the explicitly separate human PET calibration below when available. The functional response layer uses measured endpoints where available. Legacy `efficacy` coefficients remain illustrative fallbacks, and are bypassed when an applicable functional assay is present. Neither numerical precision nor a source link implies whole-human precision.

## Human PET occupancy calibration and external comparison

For newly curated aripiprazole D2 profiles, a target-specific signal compartment uses the model fit in [Kim et al. (2012)](https://doi.org/10.1038/jcbfm.2011.180):

```text
dCe/dt = 0.725 h⁻¹ × (Cp − Ce)
PET occupancy = Ce / (8.63 ng/mL + Ce)
concentration in ng/mL = concentration in nM × molecular weight in g/mol / 1000
```

`Ce` is a **total-plasma-equivalent effect signal**, separate from both mass-bearing compartments. It consumes no drug amount and is not unbound brain concentration, BBB permeability, Kp,uu or a molecular binding rate. Each fixed PK step uses exact exponential relaxation toward the interval mean plasma concentration; substituting that mean for a continuously changing input remains a numerical approximation. The fitted maximum is 100%. The app retains the measured binding Ki and the independent functional assay; this PET calibration changes the occupancy estimate, not those quantities or the functional response concentration.

The single-compound PET occupancy already represents in-vivo competition. Its occupancy odds are normalized to the endogenous baseline once when combined with the app's competition pool. Competition with other drugs remains an unvalidated transfer rule, not a measured PET mixture response.

An external check uses [Ito et al. (2012)](https://doi.org/10.1371/journal.pone.0046488): four caudate/putamen group means, measured plasma means and the conditional approximation `Ce = Cp`. Mean absolute error changes from **20.811 to 4.117 percentage points**, with the largest corrected residual **8.066 points**. These group means share participants; they are not four independent experiments. Parameters were not retuned to those observations. The comparison is conditional on measured exposure and equilibrium, not a test of predicted plasma exposure or delay dynamics. See [the PET audit](research-validation-pet.md) for observations, calibration-versus-test provenance and limitations.

## Functional concentration–response evidence

`functionalAssay` records keep midpoint type and concentration in nM, maximum response, reference agonist or control, species, experimental preparation, endpoint, sources and limitations. The [functional evidence audit](research-pharmacology.md) lists the selected measurements. These are experiment-specific endpoints, not universal drug potencies or intrinsic neuronal efficacies. `src/functional-response.js` implements:

```text
w = (C / midpoint)^h
assay response = Emax × w/(1+w)
```

An EC50 gives half of the selected assay maximum; an uptake/current-inhibition IC50 gives half of the selected inhibition maximum. A PAM maximum describes the fractional increase above the GABA control, so 1.91 means 191% potentiation (2.91 times control at saturation). Hill slopes and inhibition asymptotes without measured support are labeled assumptions. At the reported midpoint the reconstructed endpoint is exactly half maximal, but the curve is not a new fit to raw experimental observations or a human prediction interval.

The input C is modeled unbound brain concentration substituted for experimental bath concentration. This, omitted receptor subtypes/signaling bias, endogenous tone, and application of a fixed-voltage channel experiment to a generic network are assumptions. Ketamine's selected IC50 includes its specific magnesium and voltage conditions; there is no dynamic voltage/use-dependent blockade model. Binding occupancy is **unchanged** by the functional curve and remains an estimated proxy when its affinity is not measured. The separate aripiprazole PET signal is not substituted for this functional concentration.

To connect these assays to the simulation, when an orthosteric functional curve is available the estimated activity proxy is `(Acontrol + Σw_i Emax_i)/(1+Σw_i)`. For transporter inhibition, remaining capacity is `1−Σw_i Imax_i/(1+Σw_i)`. Unmeasured receptor competitors use weights `(C/K*)/(1+w0)` and fallback efficacy; transporters use `C/K*`. The normalization preserves the legacy response when an assay-backed ligand approaches zero concentration. These cross-assay pools and baseline interpolation are explicit modeling choices, not measured combination responses or a mechanistic derivation from receptor reserve. PAMs use gain `1+Σw_i Pmax_i/(1+Σw_i)`; channel blockers use remaining fraction `1−Σw_i Imax_i/(1+Σw_i)`. Without functional data, the previous binding-based response rules below are retained. Every target panel distinguishes functional response evidence from occupancy evidence.

The synapse microdomain now receives the equivalent SERT load `(1−capacity)/capacity`, matching the general target layer's functional uptake capacity. Its microscopic rates and equivalent reservoir concentration remain illustrative; it does not become an independently calibrated transport-cycle model.

`brainEquilibrationH` values remain explicit assumptions. Most `brainPartition` values remain assumed; bupropion now uses a rat microdialysis/population-model Kp,uu of 1.9, with transfer to humans labeled an estimate. Free fractions are labeled individually: some come from product-label protein binding, some are approximations and some are unknown-parameter assumptions. The aripiprazole free fraction of 0.01 approximates an upper bound from reported greater-than 99% binding; it is not an exact measured value. LSD's 0.5 free fraction is an assumption, not a verified human value.

## Plasma and brain compartments

The model uses plasma amount `P` and a brain unbound-equivalent amount `B`, both in nmol, with time in hours:

```text
Vp = 3 L                       Vb = 1.4 L
Cp = P/Vp                      total plasma, nM
Cf = f × Cp                    unbound plasma, nM
Cb = B/Vb                      unbound brain-equivalent, nM
```

The two volumes are teaching model settings. `Vb` is not an empirically fitted drug-specific distribution volume. They must not be used to infer an administered dose.

For unbound partition ratio `Kp,uu` and equilibration setting `τ`:

```text
r = f × Kp,uu × Vb/Vp
exchange = 1/τ
kBP = exchange/(1+r)
kPB = exchange − kBP

dP/dt = −(ke + kPB)P + kBP B
dB/dt = kPB P − kBP B
```

With elimination disabled, the exchange equilibrium gives `Cb/Cf = Kp,uu` and conserves total amount. With elimination enabled, an eliminated-amount ledger closes the mass balance. The model advances this linear two-compartment system with a matrix exponential during fixed **1/240-hour** steps. Inhibitor-dependent elimination is frozen within each step; the overall interaction model is therefore a time-discretized approximation, not a fully exact nonlinear physiologically based PK system.

Where feasible, the baseline elimination rate is calibrated so that the slow eigenvalue matches the selected terminal rate `λ = ln(2)/halfLifeH`:

```text
ke = λ(exchange − λ)/(kBP − λ), provided kBP > λ
```

A fallback is explicitly flagged when those assumptions cannot support that terminal rate. Catalog half-lives are representative summaries and not route-, genotype-, age- or dose-specific estimates. Fluoxetine's selected value summarizes chronic parent elimination; acute kinetics and norfluoxetine differ. Diazepam has faster distribution and active metabolites. Ketamine's 2.5-hour setting comes from the labeled redistribution phase, not a fitted universal one-compartment clearance parameter. Those distinctions are retained in each record's evidence note.

No absorption model, gastrointestinal tract, dose-to-exposure conversion, tissue binding, active transport, renal filtration or explicit metabolite system is included in this general compartment view.

## Drug interactions

### Metabolic interaction

The model now separates measured inhibitor potency, conditionally derived substrate clearance fractions, and observed human-study results. Parent bupropion CYP2D6 Ki is 12,650 nM from human liver microsomes. Fluoxetine uses enantiomer-specific nominal Ki values of 860 and 68 nM, corrected once for incubation binding to 412.8 and 35.36 nM. Equal free parent enantiomer fractions are assumed. See [the interaction research audit](research-interactions.md) for primary sources, assay context and every remaining approximation.

For selected CYP2D6 substrates:

```text
w = Σ inhibitor components (free-plasma concentration × component fraction / Ki,unbound)
fm = 1 − 1 / observed human AUC ratio
clearance multiplier = (1 − fm) + fm / (1+w)
```

Aripiprazole's fraction is derived from the 2.12-fold AUC ratio with quinidine; LSD's from the 1.76-fold ratio with paroxetine in a normal-metabolizer subgroup. These fractions assume complete selective inhibition, linear clearance and unchanged bioavailability. Their application to arbitrary virtual plasma exposures is an estimate, not a measured combination effect. Oral-study AUC ratios are never multiplied directly into the current mixture. Free plasma substitutes for liver exposure; active metabolites, genotype, enzyme adaptation and self-inhibition are omitted. Parent-only bupropion inhibition can strongly underrepresent the clinical interaction.

An interaction without both a curated potency and substrate fraction is labeled **unquantified**, and no numerical clearance change is applied. This does not establish absence of an interaction. Human-study cards preserve their actual population, regimen and endpoint separately from current simulation values. The prior shared 100 nM/50% assumptions remain only in imported legacy PK checkpoints, visibly labeled for replay; fresh experiments use the evidence model.

The [interaction benchmark](research-validation-interactions.md) reconstructs a published static comparison at study-context concentrations. For desipramine, the parent-only AUC ratio is **1.017**, versus **5.2 observed**; including measured metabolite pools gives **1.731**. The paper's animal-derived hepatic enrichment sensitivity gives **3.946–5.086**. The benchmark uses literature substrate fractions, not fractions inferred from the comparison endpoint. Its concentration inputs come from a different study, so it is a retrospective reconstruction rather than matched-participant or prospective validation. The liver range is not a confidence interval. These calculations do not create a dynamic metabolite system in the live simulation, and neither bupropion nor fluoxetine's full clinical interaction is validated. The aripiprazole/quinidine and LSD/paroxetine results used to derive live clearance fractions remain calibration data and are excluded from independent checks.

### Pharmacodynamic combinations

For competitive orthosteric binding, each selected drug has weight `wi = Cb,i/K*i`, and an endogenous drive `w 0` represents the transmitter:

```text
denominator = 1 + w0 + Σwi
fraction occupied by drug i = wi/denominator
activity proxy = (w0 + Σwi εi)/denominator
```

For transporters, the simplified substrate-free competition denominator is `1+Σwi`; available capacity is `1−total drug occupancy`. This does not resolve substrate transport states or convert occupancy directly into a transmitter concentration.

PAMs use a separate binding pool, and potentiate pre-existing receptor activity. Channel blockers use a separate reduction factor. Binding occupancy uses the equations above; activity uses the functional curve where supplied, otherwise the legacy response approximation. These are teaching approximations; they omit multiple binding sites, allosteric cooperativity, channel use dependence, voltage, signaling bias, internalization and desensitization. Aripiprazole is a partial agonist, so its effect on the activity proxy depends on endogenous drive. It should not be displayed as a fixed dopamine “block percentage” equivalent to a pure antagonist.

The shared adenosine, GABAA, NMDA and nicotinic targets compress receptor subtypes and anatomical distributions. Serotonergic effects cannot be combined into a validated additive clinical risk or experience score. A human [paroxetine–LSD experiment](https://pubmed.ncbi.nlm.nih.gov/40022427/) illustrates that metabolic and subjective effects can diverge; it does not validate extrapolation to every serotonergic combination. Absence of a modeled interaction means that the interaction is **not represented**, not that a combination is safe.

## Spiking network

The neural layer uses the [Izhikevich model](https://www.izhikevich.org/publications/spikes.pdf):

```text
dv/dt = 0.04v² + 5v + 140 − u + I
du/dt = a(bv − u)
if v ≥ 30: v ← c; u ← u + d
```

Its membrane variable and recovery variable produce spikes in a reduced point-neuron model. They are not an all-channel Hodgkin–Huxley reconstruction. Neural time is in **milliseconds**, separate from the PK clock in hours.

The default network has 32 excitatory regular-spiking units and 8 inhibitory fast-spiking units. Connections are randomly drawn with 20% probability. Excitatory synaptic current retains an assumed 5 ms decay. Baseline inhibitory decay is now `41/ln(4) ≈ 29.58 ms`, derived from the rat-culture reference below; transfer to this generic circuit is assumed. Voltage integration uses two half steps within a 0.25 ms neural step. A seeded matched control uses the same network, reference decay and background noise without drug modulation. Firing-rate summaries use a rolling 1-second neural window.

### Measured inhibitory-current duration

For identified diazepam alone at the GABAA target, [Cao et al. (2018)](https://doi.org/10.1038/s41598-018-28754-7) supply peak-to-25% sIPSC durations of 41, 63, 65 and 87 ms at 0, 10, 100 and 1000 nM in rat hippocampal cultures. Their endpoint is **not** exponential tau. Assuming a single exponential, `exp(−duration/tau)=0.25` gives `tau=duration/ln(4)`. In this path the GABA terms in the generic current bias/gain below are disabled, and only inhibitory decay is prolonged. The measured functional PAM curve still supplies the separately labeled regional activity proxy; it is not also applied to circuit amplitude.

The [synaptic evidence audit](research-neural.md) records SDs, sample sizes, bath pretreatment, interpolation and transfer assumptions. Below 10 nM, linear interpolation is estimated; between measured positive nodes interpolation uses log concentration. Above 1000 nM the final anchor is held and marked outside the measured range, not asserted to be a measured plateau. An unmatched GABAA drug/mixture disables this single-compound calibration and retains estimated generic modulation. No whole-human or dose-to-firing calibration is claimed.

[Independent preparation comparisons](research-validation-neural.md) expose a transfer limitation. At 1 µM the model predicts `100 × (87/41 − 1) = 112.2%` decay prolongation. An acute rat cortical experiment reports **72.5 ± 12.9% SEM**, and mouse amygdala group means imply **49.1%**. The latter has no derived error bar because paired covariance is unavailable. These observations use different event types and preparations, so their residuals remain visible without fitting an unsupported universal correction. A seven-day diazepam pretreatment result of **25.6 ± 7.48% SEM** is classified **unsupported**: no tolerance onset, adaptation or recovery kinetics exist in the concentration-only model.

**All remaining target-to-current shifts and amplitude gains are estimates.** They are neither fitted to human electrophysiology nor implied by the receptor assays. For auditability, with `δT` denoting change in the target activity proxy (set GABAincrement and the GABA bias term to zero on the calibrated decay path):

```text
E input shift = clip[−5,7](
  0.4 SERTblock + 1.2 DATblock + 1.2 NETblock
  + 4 δHT2A − 3 δHT1A − 1.2 δD2
  + 4 δNACHR − 4 δADENOSINE − 3 max(0,δGABAA))
I input shift = clip[−3,3](1.5 δNACHR − max(0,−δNMDA))
E synaptic gain = clip[0.2,2](1 − 1.2 NMDAdecrement)
I synaptic gain = clip[0.25,4](1 + 4 GABAincrement)
```

Cell type, receptor location, brain region, recurrent circuitry and adaptation can change or reverse actual physiological responses. Consequently, network traces are outcomes of this chosen model. A higher simulated firing rate does not mean improved mood, better cognition, greater subjective intensity, an adverse event or a clinical treatment response.

## Qualitative cofactor pathway

Cyanocobalamin has `modelType: "cofactor"`, `simulationSupported: false`, no acute receptor targets and no invented PK constants. It nevertheless supports a **qualitative exposure annotation and pathway**. The user-entered initial plasma concentration is recorded without evolving it. Brain concentration is unknown, not assumed zero or equal to plasma.

The pathway depicts carrier-bound circulation, receptor-mediated cellular uptake, intracellular release, cofactor processing and metabolic maintenance. Transcobalamin-bound cobalamin is taken up through CD320; this is distinct from neurotransmitter receptor activation. [Primary cellular uptake experiment](https://pubmed.ncbi.nlm.nih.gov/32898552/).

MMACHC can remove cyanocobalamin's cyano ligand as part of intracellular processing. [Primary biochemical study](https://pubmed.ncbi.nlm.nih.gov/18779575/). Subsequent active B12 forms serve cofactor roles in methionine synthase and methylmalonyl-CoA mutase pathways. [NIH fact sheet](https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/). A [human/translational study of CD320 and central B12 deficiency](https://pubmed.ncbi.nlm.nih.gov/38924428/) further demonstrates why plasma concentration alone cannot establish brain delivery.

These stages have no assigned durations, uptake constants, repair rates or acute firing effect. They are a sourced process diagram, not a kinetic model of deficiency, supplementation or nervous-system recovery.

## What the tests establish

`tests/catalog.test.js` checks all ten canonical identities, alias coverage, structure CIDs, explicit dimensionality, elemental composition, formal charge, valid molecular graphs, bond geometry, source checksums, parameter evidence fields, known stereoisomers and racemate labeling. It also guards against treating B12 as an acute receptor ligand, and ensures that illustrative IC50-based scales are not mislabeled as measured Ki values.

The separate PK and neural tests check numerical behavior of the implemented equations. `npm run validate:science` reproduces the curated PET, synaptic and interaction comparisons, including their discrepancies; the in-app Validation panel exposes the same evidence classes. See [VALIDATION.md](VALIDATION.md). Passing automated checks establishes correct execution and regression behavior, not an empirically validated entire brain, drug combination or particular person. The experimental comparisons establish only the scoped endpoint agreements and mismatches described above.
