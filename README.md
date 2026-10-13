# NeuroScope — Brain Pharmacology Lab

**NeuroScope 2.0.0** is an interactive 3D browser program for exploring brain-active molecules, circulation, blood–brain exchange, target interactions and neuronal activity. Written in JavaScript with Three.js, it combines sourced molecular structures with explicitly bounded computational models. Numerical engines run independently of rendering.

[Open the hosted NeuroScope lab](https://neuroscope-lab.adepttuna5.chatgpt.site). The site's existing private audience is preserved; the link does not grant public access.

## Run locally

Use Node.js 20.19+ or 22+ and a browser with WebGL 2.

```sh
npm ci
npm test
npm run dev
```

Open the localhost URL printed by Vite. Build and preview the static application with:

```sh
npm run build
npm run preview
```

Serve `dist/` through an HTTP server. Opening `index.html` with `file://` will not load browser modules and data correctly. The curated catalog, structures and numerical engines are bundled for local use. Looking up additional compounds requires access to PubChem; unavailable network requests do not remove the bundled library. Optional web fonts have local fallbacks. No application backend is required.

## Explore the laboratory

- **Circulation:** add one or more virtual exposures and inspect the schematic body, bloodstream, organs and distribution. Inputs are increments of initial **total plasma concentration in nM**, not administered doses.
- **Blood–brain barrier:** inspect a magnified neurovascular unit with endothelial cells, tight junctions, supporting cells and a separate brain compartment. Tracers illustrate circulation; their speed and number do not measure blood flow or molecular flux.
- **Neural circuit:** compare a 40-cell excitatory/inhibitory spiking network with a matched baseline using the same connectivity and noise. Voltage traces, spike rasters and firing rates display the consequences of the chosen model.
- **Synapse:** follow serotonin release, diffusion, binding, SERT reuptake, recycling and clearance in the retained stochastic microdomain. The general model's SERT inhibitor load drives an illustrative connection to this view.
- **Structure:** inspect atoms, bonds, hydrogens and stereochemistry. The library also includes serotonin and the experimental SERT structure 5I71 with its bound ligand. Experimental protein geometry remains static.
- **Targets and interactions:** compare transporter inhibition, antagonism, partial agonism, positive allosteric modulation and channel blockade. Occupancy and activation are separate quantities. Evidence notes distinguish assay values from model assumptions.

### Find a molecule

Search by **name, PubChem CID, chemical formula or SMILES**, choosing an explicit input mode when auto-detection is ambiguous. A formula can match several constitutional or stereochemical isomers; select a specific candidate rather than treating a formula as a unique identity. Stereochemical SMILES and specific CIDs preserve more identity information than an informal name.

Ten curated profiles use the same evidence schema:

| Compound | Modeled role |
| --- | --- |
| Escitalopram | SERT inhibition |
| Aripiprazole | D2/5-HT1A partial agonism and 5-HT2A antagonism |
| Bupropion | NET/DAT inhibition; selected metabolic interaction |
| Cyanocobalamin (B12) | Qualitative transport and cofactor pathway |
| LSD / lysergide | 5-HT2A/5-HT1A agonism |
| Caffeine | Lumped adenosine antagonism |
| Nicotine | α4β2 nicotinic receptor agonism |
| Diazepam | GABAA positive allosteric modulation |
| Ketamine | NMDA channel blockade |
| Fluoxetine | SERT inhibition |

Recognized salt aliases normalize to a specified parent moiety: for example, bupropion hydrochloride resolves to bupropion. Formulation-dependent absorption is not inferred. “B12” selects the explicitly named cyanocobalamin form, not every cobalamin.

Additional PubChem compounds can be viewed as structures. **Molecular identity or geometry alone does not supply a brain-effect model.** Quantitative simulation of an unknown compound requires an explicit custom PK/PD profile; missing pharmacology is not guessed. Select **Define a research profile** to enter half-life, unbound plasma fraction, unbound brain/plasma partition ratio and equilibration time, then add target, action, affinity-scale and efficacy hypotheses. An optional reference URL can accompany the profile. These manually supplied values are labeled user assumptions, and experiment exports preserve them. PubChem 3D conformers are used when available. A fallback 2D record remains visibly labeled as a connectivity diagram.

Cyanocobalamin has a 2D structure and a sourced qualitative pathway through carrier binding, cellular uptake, intracellular processing and cofactor function. Its entered plasma concentration is a recorded annotation, not an evolving PK trace. Brain concentration and acute firing effects remain unknown. The program does not invent B12 uptake rates, repair kinetics or neurotransmitter-receptor activation.

### Navigation and playback

| Input | Action |
| --- | --- |
| Left drag / one finger | Orbit |
| Wheel / pinch | Zoom |
| Right drag / two fingers | Pan |
| `F` | Toggle fly navigation |
| Fly mode: drag | Look around |
| Fly mode: `W A S D` | Move |
| Fly mode: `Q E`, `Shift` | Down/up; move faster |
| `0` | Reset camera |
| `Space` | Pause/resume |

Camera movement remains available while paused. Playback includes pause/resume, single-step, speed selection, reset and history replay. Returning to an earlier checkpoint and continuing creates a new continuation of that experiment. Export an experiment to JSON for saving; import it to restore supported model state and continue a reproducible run. Browser memory is temporary, so export work before refreshing.

**There are separate scientific clocks.** At 1× speed, each second of playback advances systemic PK by **0.5 hours**, the neural network by **25 milliseconds**, and the legacy serotonin microdomain by **1 second**. These simultaneous views do not represent one shared physical time. The systemic clock can be held while the neural network continues, allowing a fixed exposure to be examined. Rendering frames and playback speed do not change the internal integration steps:

| Layer | Internal step | Method |
| --- | --- | --- |
| Plasma/brain PK | 1/240 hour | Exact two-compartment matrix exponential within each step; interaction-dependent clearance held within the step |
| Neural network | 0.25 ms | Izhikevich point neurons with two half steps for voltage |
| Serotonin microdomain | 0.01 s | Gillespie reaction events and reflected Brownian endpoint sampling |

## Scientific scope and evidence

See [docs/PHARMACOLOGY.md](docs/PHARMACOLOGY.md) for the general model's equations, units, catalog provenance, parameter evidence and limits. [docs/SCIENCE.md](docs/SCIENCE.md) documents the retained serotonin microdomain and SERT structure.

Small-molecule 3D coordinates are **computed PubChem conformers**, not experimentally measured solution ensembles or a calculated receptor-binding trajectory. Coordinates retain bond connectivity, formal charges and source provenance. Escitalopram, nicotine and lysergide stereochemistry is checked from coordinates. A representative conformer of an unspecified/racemic parent is labeled accordingly. Most reference structures are neutral parent forms; they are not claims about the predominant physiological protonation state. The escitalopram reference explicitly depicts its cation.

SERT uses the experimental **3.15 Å 5I71 crystal structure**, an engineered construct. Anatomy, circulation, receptor glyphs and network wiring are schematic. The program does not calculate solvent dynamics, molecular forces, protein conformational free-energy pathways, complete brain anatomy or whole-human physiology.

The PK system conserves modeled amounts across plasma, a brain unbound-equivalent compartment and an elimination ledger. Target competition uses sourced affinities where supported and clearly labeled illustrative response scales elsewhere. All numeric efficacy values, brain partition settings and target-to-circuit couplings are model assumptions. Selected CYP relationships are sourced, while their quantitative inhibition strengths are illustrative. Active metabolites and most biological adaptations are omitted.

The firing traces show what these equations produce. They do not predict a person's perception, mood, clinical response or risks from a combination. Missing modeled interactions indicate incomplete coverage. Passing software tests verifies implementation properties, not biological calibration.

## Tests

`npm test` runs Node.js tests covering:

- PK mass balance, nonnegative concentrations, exchange equilibrium, terminal half-life behavior, competition, modulation and selected metabolic interactions.
- Neural spike/reset dynamics, excitatory/inhibitory signs, matched controls, integration convergence and seeded reproducibility.
- Frame-partition independence and JSON checkpoint continuation for the numerical engines.
- Serotonin diffusion statistics, confinement, reaction accounting, equilibrium occupancy and reduced reuptake under inhibition.
- Catalog identities, aliases, evidence classifications, supported versus unsupported mechanisms and explicitly qualitative B12 behavior.
- Molecular composition, charge, connectivity, bond geometry, dimensionality and stereochemistry, including mirrored-coordinate negative controls.
- Lookup ambiguity, offline aliases, source atom indexing, error handling and honest 2D fallback.
- Finite body, barrier, neuron and molecular geometry, topology correspondence and coordinate-preserving rendering.

## Project layout

```text
src/experiment.js        Coupled playback clocks, checkpoints and experiment import/export
src/pharmacology.js      Plasma/brain amounts, target competition and interactions
src/neural.js            Seeded spiking network and matched baseline
src/simulation.js        Stochastic serotonin microdomain
src/lookup.js            PubChem identity search and coordinate loading
src/body.js              Schematic body, barrier and circuit geometry
src/neuron.js            Schematic synaptic anatomy
src/structures.js        Coordinate-preserving molecule/protein rendering
src/scene.js             3D views, camera, picking and display animation
src/main.js              Application controls, state, playback and persistence
src/content.js           In-app model notes and evidence links
src/style.css            Responsive interface
public/data/
    compound-catalog.json     Ten curated profiles with evidence classifications
    compound-structures.json  Nine 3D conformers and explicit 2D cyanocobalamin
    molecules.json            Serotonin/escitalopram reference conformers
    sert.json                 Experimental 5I71 backbone, ligand and pocket
    science.json              Legacy microdomain evidence and assumptions
tests/                  Numerical, identity, chemistry and geometry tests
docs/PHARMACOLOGY.md     General pharmacology model and source notes
docs/SCIENCE.md          Serotonin microdomain and molecular structure notes
```
