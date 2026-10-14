# Regional activity and symbolic workspace

**This program does not implement a complete human brain or predict human consciousness, intelligence, perception or subjective drug effects.** It combines a 30-region population model with an explicit symbolic memory-and-selection algorithm. A separate optional language model can describe the recorded state. These layers are inspectable computational demonstrations; their coupling is not a validated model of human cognition.

## Anatomy and modeled scope

The 30 populations comprise bilateral dorsolateral and ventromedial prefrontal cortex, orbitofrontal cortex, anterior and posterior cingulate cortex, precuneus, inferior parietal association cortex, inferior frontal association cortex, lateral temporal association cortex, hippocampus, amygdala, associative striatum, mediodorsal thalamus and cognitive cerebellar territory, plus lumped dorsal raphe and locus coeruleus populations. Each region has one excitatory and one inhibitory rate variable. Applying this same reduction to nuclei and cortex is itself an illustrative abstraction.

The display uses actual FreeSurfer fsaverage5 cortical surface data distributed by Nilearn, but the regional markers use **approximate, unregistered MNI-like coordinates**. They are not segmented parcels fitted to that surface. Cerebellum and brainstem context geometry is schematic. See [BRAIN-ANATOMY.md](BRAIN-ANATOMY.md) for exact records, coordinate conversion, checksums and licenses.

The model has **132 directed effective connections** with assumed strengths and delays. Curves are illustrative paths, not tractography or a measured human connectome. Six human PET maps from [Hansen et al., 2022](https://www.nature.com/articles/s41593-022-01186-3) now inform 120 of 300 regional sensitivity weights. These dimensionless spatial proxies use explicitly named, hemisphere-specific parcels, divided by the same target's reference mean. Anatomical mapping, equal parcel averaging, normalization and the proportional conversion from binding to neural sensitivity remain estimates. They do not measure neuronal gain. See [the regional data audit](research-regional.md) for imported values, tracer limitations, mapping, reproducibility and license.

Primary visual, auditory, somatosensory, olfactory and gustatory populations and their inputs are excluded from this functional network. The anatomical cortex remains visible as reference. This node selection does not imply that real sensory processing comprises five cleanly separable modules, or that association regions are biologically independent of sensory experience. Typed text enters a **direct symbolic software channel**; it does not simulate biological reading or establish a physically sensory-free human brain.

## Regional equations

The implementation is a reduced Wilson–Cowan-type rate model, motivated by the coupled excitatory/inhibitory population framework of [Wilson and Cowan, 1972](https://pmc.ncbi.nlm.nih.gov/articles/PMC1484078/). It omits the original refractory-population factor and uses a sigmoid transfer function. The following coefficients are implementation assumptions, not fitted human parameters.

For region r, with rates E and I normalized to [0,1]:

```text
S(x) = 1 / (1 + exp(−x))
C_r = 0.7 Σ_j w_jr [E_j(t − delay_jr) − 0.2] / Σ_j |w_jr|
20 ms · dE_r/dt = −E_r + S(10 E_r gE_r − 8 I_r gI_r + C_r
                           + 1 + drive_r + bE_r + noise_r − 2.8)
10 ms · dI_r/dt = −I_r + S(8 E_r gE_r − 3 I_r + 0.4
                           + 0.25 drive_r + bI_r + 0.7 noise_r − 2.8)
```

Connection delays range from 5 to 24 ms. Incoming strengths are normalized by their absolute sum. A history ring buffer stores delayed excitation. Gaussian input with standard deviation 0.025 is held for 5 ms. At each 0.5 ms substep, the sigmoid input is frozen and the relaxation is integrated as `E_new = E + (1 − exp(−dt/tauE)) (S(inputE) − E)`; I uses its own time constant. This convex update keeps populations bounded. It is not an exact solution of the fully coupled nonlinear ODE. Tests compare smaller substeps to check convergence.

A comparison population receives exactly the same starting state, noise and current internal cognitive drive. Its gains are 1 and direct drug biases are 0. The shared drive comes from the one symbolic workspace, whose metrics respond to drug-modulated regional activity. Consequently, drug-dependent changes in cognitive drive reach **both** populations. This is a **comparison without direct drug modulation under the same current cognitive drive**, not an independently evolving untreated or no-drug counterfactual. The API retains the names `baselineE`, `baselineI` and `baselineActivity` for this comparison. Differences from those values do not estimate a complete drug effect on cognition.

## From targets to regional dynamics

The PK/PD layer supplies receptor activity changes Δ and transporter blockade B = 1 − activity. Selected activity proxies now use measured functional EC50/IC50 and assay maxima, separately from binding affinity. Their transfer to endogenous brain activity remains an estimate. The rat-culture diazepam synaptic-decay calibration applies to the separate spiking circuit, not these regional populations. Regional weights d use PET-derived spatial proxies where supported, otherwise labeled fallback estimates. SERT, 5-HT1A, 5-HT2A and GABAA maps cover 24 nodes each; D2/3 covers 22 extrastriatal proxies; DAT covers the two caudate proxies. No whole-thalamus or brainstem map is silently assigned to a specific nucleus. Define G = d_GABAA max(0, Δ_GABAA) and N = d_NMDA max(0, −Δ_NMDA). The exact default transfer rules are:

```text
bE = clip(0.2 d_SERT B_SERT + 0.5 d_DAT B_DAT + 0.5 d_NET B_NET
          + 1.8 d_HT2A Δ_HT2A − 1.1 d_HT1A Δ_HT1A − 0.4 d_D2 Δ_D2
          + d_NACHR Δ_NACHR − d_ADENOSINE Δ_ADENOSINE − 0.6 G, −3, 3)
bI = clip(0.4 d_NACHR Δ_NACHR − 0.7 N, −2, 2)
gE = clip(1 − 0.55 N, 0.2, 1.5)
gI = clip(1 + 1.5 G, 0.5, 3)
```

These signs and magnitudes are population-scale hypotheses. Real receptor actions depend on cellular expression, circuit and brain region. Transporter blockade does not explicitly create a regional transmitter pool here. No compound-name rule directly assigns a cognitive effect. The computational chain is:

```text
virtual plasma exposure → brain exchange → target competition/activity
→ PET-weighted or estimated regional bias/gain → population activity
→ assumed workspace metrics → memory selection probabilities
```

B12 remains a qualitative cofactor annotation and has no fabricated acute receptor, population or cognitive effect. PK/PD equations and evidence classifications are documented in [PHARMACOLOGY.md](PHARMACOLOGY.md).

The activity entropy is `−Σ p_r ln(p_r) / ln(30)`, where `p_r = E_r / Σ E`. It measures the spatial distribution of these 30 activity values. It is not a consciousness score, neural complexity measure, integrated-information calculation, or psychometric assessment.

## Symbolic workspace equations

`src/cognition.js` stores explicit concepts, user statements/questions, focus, retrieved memories and events. For each region group let δ be mean drug-modulated E minus comparison E without direct drug modulation, with both branches sharing the current cognitive drive as described above. Groups are PFC = dorsolateral PFC, HIP = hippocampus, ASSOC = PCC/precuneus/temporal/IPL, ACC = anterior cingulate, and STR = striatum. The exact metric rules are:

```text
attention   = clip(0.72 + 1.2 δ_PFC + 0.4 δ_ACC, 0.10, 0.98)
retention   = clip(0.85 + δ_HIP + 0.35 δ_PFC, 0.10, 0.99)
flexibility = clip(0.42 + 1.3 δ_ASSOC − 0.35 δ_PFC + 0.25 δ_STR, 0.05, 0.95)
inhibition  = clip(0.65 + 0.6 δ_ACC − 0.5 δ_ASSOC, 0.10, 0.98)
```

These names label algorithm parameters; they are **not validated cognitive or psychometric measurements**. Inhibition is currently an observable derived metric and does not change selection. A user statement is attributable input, not verified knowledge.

Tokens are lowercased Unicode letters/numbers with a fixed stop list removed; unique tokens longer than one character are retained, up to 80. Lexical similarity is the intersection size divided by the square root of the two token-set sizes. Memory retrieval uses:

```text
score_m = 0.7 similarity(focus, memory_m) + 0.25 strength_m
          + 0.05 exp(−(t − lastRetrieved_m)/30 s)
working-memory count = max(2, round(2 + 4 attention))
strength_new = strength · exp(−0.05 s · (1 − retention) / 120 s)
```

Every 2 playback seconds, autonomous selection considers the top eight retrieved memories. A candidate identical to the current focus receives a penalty of `0.12 flexibility`. Temperature is `T = 0.12 + 0.65 flexibility`; selection probability is `exp((score − maximumScore)/T)` normalized across candidates. A seeded random draw selects one candidate. Its strength increases by `0.04 retention`, capped at 1, and its retrieval time is recorded. Initial seed-concept strengths are 0.65. User input receives strength 1. Memory, event and message capacities are 64, 200 and 80; export exposes event truncation counts.

The reverse coupling supplies the same current cognitive drive to the drug-modulated and comparison populations; the comparison does not have its own untreated workspace. With any recorded user/assistant message, left/right DLPFC receive `0.25/0.22 × attention`, left IFG 0.16, and left temporal cortex 0.12; otherwise DLPFC receives 0.04 and those language-region drives are zero. A three-phase cycle, `floor(playbackTime/2) mod 3`, provides left/right hippocampus `0.15/0.12 × retention` in autonomous phase 1, otherwise 0.03. Left/right PCC receive `0.1 × flexibility` in autonomous phase 2, otherwise zero. These are arbitrary software couplings, not claims that particular concepts have those anatomical encodings.

## Distinct clocks and language interface

At 1× playback, one second advances PK by **0.5 hours**, the regional and spiking models by **25 ms**, and the legacy synapse by **1 second**. The symbolic workspace advances on playback time with 0.05-second ticks; its 2-second selection cycle therefore corresponds to only 50 ms of model neural time. These units are deliberately separate visual timescales. A semantic cycle is not a predicted biological thought duration.

The offline state inspector produces bounded, deterministic descriptions of recorded values and memories. Optional WebLLM provides language generation after explicit user loading in a compatible WebGPU browser. Its text is conditioned on supplied simulation state; it does not emerge from the 30 E/I populations. It does not expose all hidden reasoning, establish human-level intelligence, or turn the model into a validated conscious brain. The journal shows explicit equations, retrieval candidates, selection probabilities and recorded response provenance. See [DIALOGUE.md](DIALOGUE.md) for model loading, network requirements, limitations and cancellation behavior.

## Replay, exports and validation

JSON exports preserve PK profiles and ledgers, numerical clocks, random states, regional populations, delay buffers, targets, internal drives, workspace memories/events/messages and response mode/model/context provenance. Replay uses saved response text; it does not regenerate an LLM answer. Weights and runtime state of the separate language model are not part of a numerical checkpoint.

Older version-1 experiment files without regional/workspace states initialize those layers at the imported clock. An explicit migration note records that past regional dynamics and workspace events were unavailable. The program does not reconstruct or invent that history. Invalid imports are validated in a temporary experiment and leave the existing experiment unchanged on failure.

Current regional exports include `regionalModelRevision: "pet-spatial-v1"` and continue exactly. Older regional checkpoints retain their saved states and delay histories, but future modulation uses the new spatial weights; a persistent migration notice makes that trajectory change explicit. Older PK checkpoints retain their original assumed interaction model for PK replay and label it as legacy. Reset retains imported profiles and model settings. To start with the current catalog and evidence model, export any work to keep and reload the page.

Tests cover finite bounded populations, equality of both branches with shared noise/drive and absent direct drug modulation, delayed-state checkpoint continuation, renderer-partition independence, integration-step convergence, pharmacology-driven regional differences, B12's absent acute effect, anatomy/topology correspondence, coupled workspace replay and atomic invalid-import rejection. They establish implementation consistency; they do not establish biological calibration. Distributed association-network organization is informed by [Yeo et al., 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3174820/), while the program's chosen nodes, coordinates and edges remain schematic.
