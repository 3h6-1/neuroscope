# Scientific scope, molecular provenance and model limits

This program is an interactive **educational reaction–diffusion model**, with sourced molecular structures and procedural neuron anatomy. It illustrates how escitalopram inhibits the serotonin transporter (SERT). It is not a whole-brain reconstruction, a molecular-dynamics trajectory, a validated dosing model or an explanation of every downstream effect of an SSRI.

## What is structurally authentic

`public/data/molecules.json` stores atoms, explicit hydrogens, formal charges, bonds and coordinates in **ångströms**. Atom IDs and bond endpoints are zero based. Coordinates were downloaded from PubChem, then translated to the arithmetic atom centroid; no rotations, embedding, local minimization or invented bond geometry were applied.

| Key | Species | Formula | PubChem CID | Atoms / bonds |
| --- | --- | --- | --- | --- |
| `escitalopram` | N-protonated S-escitalopram | C20H22FN2O⁺ | [40466954](https://pubchem.ncbi.nlm.nih.gov/compound/40466954) | 46 / 48 |
| `serotonin` | Protonated side-chain amine | C10H13N2O⁺ | [4048638](https://pubchem.ncbi.nlm.nih.gov/compound/4048638) | 26 / 27 |
| `oxalate` | Oxalate dianion; optional background chemistry | C2O4²⁻ | [71081](https://pubchem.ncbi.nlm.nih.gov/compound/71081) | 6 / 5 |

The neutral parent records are [escitalopram CID 146570](https://pubchem.ncbi.nlm.nih.gov/compound/146570) and [serotonin CID 5202](https://pubchem.ncbi.nlm.nih.gov/compound/5202). Protonated amines are appropriate representative species for an aqueous physiological setting; acid–base equilibria are not being dynamically integrated. Each asset is a **computed PubChem 3D conformer**, not an experimentally measured solution ensemble or a bound conformation. Flexible bonds would sample many conformations in water. Formal bond orders, especially in oxalate, are a resonance representation rather than localized physical charges and fixed alternating bond lengths.

Each record includes its source URL, direct JSON and SDF download URLs, source SHA-256 hashes, PubChem conformer identifier and original translation. For example:

```text
https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/40466954/record/JSON?record_type=3d
https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/40466954/SDF?record_type=3d
```

The assets were retrieved on October 12, 2026. The source’s MMFF94 NoEstat energy metadata is retained for provenance; that energy is not a hydration free energy or binding affinity.

### Stereochemistry check

The downloaded escitalopram SDF was read with RDKit, keeping explicit hydrogens. Existing stereo tags were replaced with assignments derived from the actual three-dimensional coordinates (`AssignStereochemistryFrom3D(..., replaceExistingTags=True)`), then CIP labels were assigned. This independently identified atom **4** as **S**. No optimization was performed.

Its neighbors in descending CIP priority are `[1, 6, 8, 5]`. The determinant

```text
χ = det(r₁ − r₄, r₂ − r₄, r₃ − r₄) = +10.228633194 Å³
```

is retained as a coordinate integrity check. Reflecting the model reverses this sign; translations and proper rotations preserve it. A sign with arbitrary neighbor ordering does **not** establish R/S. The ordering was established by chemical CIP rules using RDKit and the SDF graph. The test guards the identified S geometry against accidental reflection, flattening or index corruption.

## Experimental SERT detail

`public/data/sert.json` is derived from the deposited [RCSB PDB 5I71](https://www.rcsb.org/structure/5I71) file. This is a **3.15 Å X-ray structure**, in an outward-open state, of a truncated, engineered thermostabilized human SERT construct. The asset contains chain A’s 542 resolved Cα positions, HELIX records, the 24-heavy-atom central-site escitalopram ligand `68P`, two deposited sodium ions and heavy atoms of residues near the ligand. All share the original deposited coordinate frame. The `center` is provided for display; a membrane orientation has not been experimentally fitted here.

The experimental ligand’s bond orders come from the [RCSB Chemical Component Dictionary entry 68P](https://files.rcsb.org/ligands/download/68P.cif). Hydrogens are not resolved in that pose. The dictionary represents the neutral chemical component; it is not a protonation measurement. This crystal pose differs from the free PubChem conformer used for moving molecules.

The backbone trace is not a molecular surface. It omits side chains outside the included binding pocket, termini not represented by the construct, antibodies B/C and most crystal additives. Segmentation prevents any future missing-density gaps from being joined by artificial peptide bonds. HELIX records can split one transmembrane helix into several sections; their count is not the transmembrane-domain count.

SERT has twelve transmembrane helices. Central-site escitalopram blocks substrate binding and stabilizes an outward-open state. An extracellular allosteric site can affect central-site ligand dissociation. See the primary structural study: [Coleman, Green & Gouaux, Nature (2016)](https://doi.org/10.1038/nature17629). The reduced simulation emphasizes the central site. Any gate animation in the tissue scene is schematic; it is not a calculated transition path between protein conformations.

## What the cell scene means

Neurons and organelles are procedural illustrations. Their branching, membrane geometry and positions are not reconstructions of a named neuron, brain region or electron-microscopy volume. Small molecules must be enlarged to remain visible from the tissue view, so their rendered radii cannot be compared directly with a soma, vesicle or axon. Molecular detail uses ångströms; the tissue and simulation scales must be stated separately in the interface.

A representative sequence is action-potential arrival, calcium-dependent vesicle release, extracellular serotonin diffusion, reversible receptor binding, SERT uptake and intracellular recycling. Sodium and chloride gradients support uptake. SERT is an alternating-access carrier, not an open channel and not an ATP-powered pump on its own. Cellular metabolism maintains the gradients. Any vesicle, calcium, electrical pulse or recycling animation is explanatory geometry unless backed by an explicitly implemented kinetic state.

Serotonin receptor activation is not automatically neuronal excitation. Receptor subtype and cell context determine the effect; many receptors signal through G proteins. Occupancy or a visual glow does not demonstrate a postsynaptic action potential. Real serotonergic release also supports extrasynaptic/volume transmission, so the app’s paired contact is a teaching geometry, not the only serotonin anatomy. [Bunin & Wightman’s primary experiment](https://doi.org/10.1523/JNEUROSCI.18-13-04854.1998) examined release, uptake and extrasynaptic transmission.

## Implemented model and default parameters

The engine integrates a **well-mixed chemical master equation with the Gillespie direct method**. Spatial positions are endpoint samples of noninteracting reflected Brownian particles in a rectangular box. The nanometre diffusion time is far shorter than the chosen reaction times, which motivates the mixing approximation. Binding depends on the pooled serotonin concentration, **not** on visual particle–protein collisions. Drug binding uses an effectively infinite fixed free-drug reservoir; decorative drug particles are not a conserved pharmacokinetic compartment.

The fixed presentation interval is **0.01 s**. The true diffusive displacement between successive samples can include thousands of membrane reflections. Method-of-images folding gives a correct reflecting-box endpoint distribution for free diffusion, but connecting displayed endpoints does not reconstruct the unresolved path or any microscopic encounter history. The animation should be interpreted as samples and schematic transitions. No collision-detection algorithm can recover missing paths from these endpoints.

| Parameter | Default | Interpretation |
| --- | --- | --- |
| Cleft box | 200 × 20 × 130 nm | Idealized rectangular teaching compartment |
| Cleft volume | 5.2 × 10⁻¹⁹ L | Used for molecule-count concentration conversion |
| Free diffusion coefficient | 4 × 10⁸ nm²/s = 400 nm²/µs | Illustrative effective coefficient |
| Initial serotonin | 120 molecules | ~383.2 µM local burst; not ambient bulk brain concentration |
| Concentration per cleft molecule | 3.193344 µM | Calculated using Avogadro’s constant and box volume |
| SERT / receptor counts | 14 / 12 | Illustrative site counts |
| Free drug reservoir | 30 nM | Model input, independent of tablet dose or displayed drug count |
| Drug `kon`, `koff` | 0.08 nM⁻¹s⁻¹, 0.08 s⁻¹ | Illustrative; `Kd = 1 nM` |
| Substrate `kon`, `koff` | 0.025 µM⁻¹s⁻¹, 1 s⁻¹ | Illustrative SERT substrate capture/release |
| SERT transport | 2 s⁻¹ | Reduced bound-substrate → intracellular transition |
| Receptor `kon`, `koff` | 0.012 µM⁻¹s⁻¹, 3 s⁻¹ | Generic receptor occupancy, not a specified receptor subtype |
| Release / clearance / recycling | 3 molecules/s, 0.025 s⁻¹, 0.5 s⁻¹ | Illustrative source, loss and recycling rates |

All box faces reflect. Extracellular escape is represented by a separate first-order clearance sink, not boundary absorption. The states are cleft ↔ SERT → cytosol → vesicle → cleft, cleft ↔ receptor, and cleft → cleared. The sink is lumped loss; it does not imply that serotonin undergoes monoamine-oxidase metabolism in the extracellular cleft. Replenishment is a source term rather than a modeled serotonin synthesis pathway.

The values above are intentionally labeled as model parameters, not experimentally fitted human constants. A single reservoir occupancy formula excludes substrate competition; observed drug occupancy with serotonin present need not equal the drug-only curve. At the default diffusion coefficient, the one-dimensional 20 nm crossing estimate is 0.5 µs, vastly below the presentation interval. The program does not slow down every molecular collision into a continuous physically resolved movie.

## Mathematical interpretation

### Diffusion

At coarse scales, solvent collisions are integrated out in an overdamped stochastic model:

```text
Δr = sqrt(2 D Δt) (ξx, ξy, ξz), each ξ ~ N(0, 1)
E[|r(t) − r(0)|²] = 6 D t in unbounded 3D
```

Each Cartesian increment has variance `2 D Δt`. Reflecting walls and reaction boundaries change the long-time mean squared displacement, so the unbounded relation is tested separately. A heuristic crossing estimate `L²/(2D)` is one-dimensional; it is not a mean first-passage result for every geometry. The simulation’s diffusion coefficient is an educational effective parameter, not a universal measured value for every brain extracellular space.

A physically dimensioned simulation must use consistent length/time units: for example `1 µm²/ms = 1,000 nm²/µs`. At molecular distances, ordinary video-frame steps are far too long. A fixed internal step and explicit conversion between simulation time and wall time are necessary; renderer frame rate must not change the stochastic law.

### Reactions and transport

For a constant hazard `k`, the event probability in a step is `−expm1(−k Δt)`. Replacing it with `k Δt` fails for large steps. Multiple competing first-order events require a combined hazard with conditional event selection, or a documented approximation.

For a single reversible site under a fixed free-drug reservoir:

```text
dθ/dt = kon[I](1 − θ) − koff θ
Kd = koff / kon
θequilibrium = [I] / ([I] + Kd)
```

This does not identify a drug dose with a free brain concentration, and a reservoir-bound ligand should not be counted as a conserved explicit particle. Conversely, a captured explicit molecule should change state rather than silently duplicate. Spatial capture models also depend on encounter geometry, microscopic boundary rules and time step; a capture radius alone is not a measured association constant.

The classical competitive Michaelis–Menten relation is a useful reduced reference:

```text
v = Vmax[S] / (Km(1 + [I]/Ki) + [S])
```

This omits detailed SERT ion coupling, voltage dependence and allosteric states. It is not a full mechanistic derivation of the transport cycle.

### Pharmacokinetics and long-term changes

A separate one-compartment illustration may use

```text
ke = ln(2) / halfLife
C(t) = F Dose ka / (V(ka − ke)) [exp(−ke t) − exp(−ka t)]
```

for `ka ≠ ke`, with sums of shifted responses for repeated doses. The equal-rate limit must be handled separately. The [Lexapro label](https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=13bb8267-1cab-43e5-acae-55a4d957630a) reports a terminal half-life near 27–32 hours and approximately one week to steady-state plasma levels. Plasma pharmacokinetics, synaptic drug concentration and delayed clinical response are different quantities. Slow adaptation cannot be inferred simply by replaying microsecond diffusion longer.

## Salt background

The focus is the escitalopram molecule. Oxalate is not covalently attached and is not treated as a SERT inhibitor. Dissociation, pH and protonation govern species in solution; the model does not depict oxalate co-traveling with every drug molecule into the brain.

The marketed salt has an overall 1:1 base:oxalic-acid composition. A primary crystallographic report describes two escitalopram cations, one oxalate dianion and one neutral oxalic acid molecule, with partial hydration; it is therefore misleading to draw a single +1 escitalopram ion and −2 oxalate ion as an electrically neutral isolated salt molecule. This crystal stoichiometry is distinct from the aqueous species representation. [Harrison et al. (2007)](https://pubmed.ncbi.nlm.nih.gov/17348096/).

## Verification and limits

`tests/molecules.test.js` checks elemental formulas, formal charges, complete explicit-hydrogen valences, connected molecular graphs, distinct valid bonds, plausible bond lengths, finite coordinates, source identifiers, S chirality, serotonin side-chain protonation and the deposited SERT backbone/ligand geometry. The stereochemical determinant is tested against reflection and translation.

These checks detect malformed assets and numerical regression. Statistical reaction–diffusion tests validate the numerical model separately. They do not validate molecular binding free energies, actual human tissue concentrations, neuron physiology or treatment outcomes. No explicit solvent, full electrostatic field, all-atom force field, realistic protein transition path, membrane-voltage solver, downstream biochemical network or complete circuit is integrated.
