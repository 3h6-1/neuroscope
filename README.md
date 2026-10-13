# Synapse — Escitalopram Lab

An interactive 3D browser program for exploring serotonin release, SERT-mediated reuptake, and inhibition by **escitalopram**. Written in JavaScript with Three.js; computation and rendering are separate. All molecular data is bundled locally.

## Run

Requires Node.js 20.19+ or 22+ and a browser with WebGL 2.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. To build a portable static web application:

```sh
npm run build
npm run preview
```

The `dist/` directory can be served by any ordinary static HTTP server. Loading `index.html` directly through `file://` does not work because browsers restrict module/data requests. Only the optional Google Fonts styling uses an external request; fallback fonts work offline. No account, server API, or external scientific data request is needed to run the local simulator after installing dependencies.

## Explore

- **Synapse:** phospholipid bilayers, presynaptic bouton, axon/microtubules, vesicles, calcium channels, mitochondria/cristae, postsynaptic spine/actin and parent dendrite. Twelve-helix SERT glyphs show drug/substrate occupancy; seven-helix generic receptor glyphs show binding. Serotonin is tracked through diffusion, binding, reuptake, recycling, and clearance. Enlarged molecular glyphs retain the sourced heavy-atom conformers.
- **Neurons:** representative somas, nuclei, axon, dendritic arbor/spines, synaptic contact, and varicose serotonergic release sites. This is schematic cellular morphology, not a reconstructed serotonergic circuit.
- **Molecules:** escitalopram⁺, serotonin⁺, and the real 5I71 SERT Cα backbone with its deposited bound ligand, pocket atoms, and sodium ions. Atom/bond picking reports chemistry; hydrogens can be hidden.
- **Experiment:** paired baseline/drug runs use seed 42. Control the free-drug reservoir (0–100 nM), toggle release, or release a pulse of 60 molecules. Concentration changes preserve existing occupied transporters and let them unbind normally.
- **Playback:** pause, resume, single step, 0.1×–5× speed, reset, and seek within the last 120 seconds. Resuming or editing an earlier checkpoint branches the run. Data stays in browser memory; refresh starts a new run.

| Input | Action |
| --- | --- |
| Left drag / one finger | Orbit |
| Wheel / pinch | Zoom |
| Right drag / two fingers | Pan |
| `F` | Toggle fly mode |
| Fly mode: drag | Look around |
| Fly mode: `W A S D` | Move |
| Fly mode: `Q E`, `Shift` | Down/up; faster movement |
| `0` | Reset camera |
| `Space` | Pause/resume |
| `R` | Release serotonin |

Camera navigation works while the simulation is paused. Select **The model**, **Sources**, or **?** inside the app for assumptions, provenance, and controls.

## Scientific scope

This is a **mesoscopic educational model, not atomistic molecular dynamics**. It does not simulate every biological consequence of escitalopram.

Small-molecule coordinates are authentic **computed PubChem conformers**, including correct protonation and escitalopram's independently checked S stereochemistry. The SERT backbone and bound ligand come from the **experimental 3.15 Å crystal structure 5I71**, an engineered thermostabilized construct. Protein glyphs, neuron anatomy, fusion pulses, and transporter gate motion are schematic. The experimental backbone is static; there is no fabricated minimum-energy conformational pathway.

The model combines exact reflected Brownian endpoint sampling with well-mixed Gillespie stochastic chemical reactions. Numerical rates are illustrative, not fitted in vivo measurements. Positions use nm, time uses s, substrate concentration uses μM, and free-drug concentration uses nM. The default diffusion coefficient is 4×10⁸ nm²/s; the estimated 20 nm cleft crossing time is 0.5 μs. The 10 ms display/reaction partition cannot resolve those microscopic paths. Interpolated visual movement is explanatory; apparent collisions do not cause binding.

Drug reservoir tracers are decorative; explicit serotonin state transitions are conserved. Receptor occupancy is not a firing rate or a measure of mood. Ion gradients are assumed maintained. Pharmacokinetics, autoreceptor feedback, allosteric binding, action potentials, membrane electrodynamics, explicit solvent, VMAT2 mechanics, metabolism, and weeks-long adaptation are outside the integrated model. See [docs/SCIENCE.md](docs/SCIENCE.md) for equations, all parameters, citations, provenance, and limitations.

## Tests

```sh
npm test
```

Automated tests cover:

- Brownian zero mean, per-axis variance 2DΔt, 3D mean-squared displacement 6DΔt, reflecting boundaries, and uniform confinement.
- Independence of fixed-step results from rendering frame partitions, seeded reproducibility, JSON checkpoint continuation, and source-rate/cap constraints.
- Drug-only equilibrium occupancy, washout/dissociation, statistically reduced reuptake under drug, and exact serotonin accounting across all states.
- Unit conversions, exponential hazards, competitive transport, and a standalone Bateman-function helper (not connected to the local synapse).
- Molecular formulas, charge/valence/connectivity, bond geometry, protonation, and coordinate-derived S chirality, including the mirrored-conformer negative control.
- Coordinate-preserving geometry, quaternion bond alignment, hydrogen controls, SERT protein/ligand frame alignment, and finite vertices/transforms.

Browser verification additionally checks loading, pause/step/replay, views, structure selection, controls, layout and console errors. Tests establish implementation properties; they do not biologically validate the illustrative parameter set.

## Project layout

```text
src/simulation.js       Pure numerical engine; no Three.js or browser dependency
src/neuron.js           Schematic cell and synapse geometry
src/structures.js       Coordinate-preserving molecule/protein rendering
src/main.js             Rendering, camera, controls, picking and replay
src/content.js          In-app scientific explanation and source links
src/style.css           Responsive interface
public/data/            Bundled molecular coordinates and provenance
    molecules.json      PubChem conformers (oxalate retained as unused background data)
    sert.json           Experimental 5I71 backbone, ligand and binding pocket
    science.json        Curated evidence, equations, sources and limitations
tests/                  Node.js numerical, chemistry and geometry tests
docs/SCIENCE.md          Full scientific model notes
```

Molecular records include retrieval URLs and source hashes. Browser status is exposed through a read-only `window.synapseLab.getState()` helper for ordinary local developer inspection.
