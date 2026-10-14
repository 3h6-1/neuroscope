# Human PET occupancy comparison

This benchmark evaluates one endpoint: aripiprazole striatal D2/3 radioligand displacement. It does not validate the neuron, regional activity, cognition, or conversation models.

## Calibration and independent observations

[Kim et al. (2012)](https://doi.org/10.1038/jcbfm.2011.180), Table 1, fit serial plasma and [11C]raclopride PET measurements in 18 healthy men. We import their effect-compartment EC50 of **8.63 ng/mL** (95% parameter CI 7.75–9.51) and equilibration rate **0.725 h−1** (95% parameter CI 0.542–0.908). The maximum occupancy was fixed at 100%. This is published model calibration, not held-out validation. The separately reported direct-plasma fit of 11.1 ng/mL is not used: the paper demonstrates why measurement timing and effect-site delay matter.

[Ito et al. (2012)](https://doi.org/10.1371/journal.pone.0046488), Table 1 and Results, provide independent observations. Twelve healthy men underwent [11C]raclopride PET starting 3.5 hours after a single oral administration. The input is the reported average of plasma samples at scan start/end; it is not an app-predicted concentration. Four regional means, drawn from two groups of five participants each, enter the error summary. The two remaining participants supply ranges, retained separately without manufacturing means or SDs.

## Limited model correction

The old Ki-based model used an assumed Kp,uu and endogenous dopamine drive. It substantially underpredicted these occupancy observations. The correction adds a **target-specific empirical effect compartment**, separate from mass-bearing plasma and brain compartments:

```text
dCe/dt = ke0 × (Cp − Ce)
O = Ce / (EC50 + Ce)
C[ng/mL] = C[nM] × molecularWeight[g/mol] / 1000
```

Ce has total-plasma-equivalent units. It is not measured unbound brain concentration, BBB permeability, Kp,uu, or a binding on/off rate. The physical binding Ki and the functional assay response remain separate. Using a PET curve to alter other targets or the functional assay concentration would not be supported by these data.

For a fixed interval mean plasma concentration, exact relaxation is `Ce_next = Ce + (Cp_mean − Ce) × (1 − exp(−ke0 × dt))`. Approximating a changing plasma trajectory by an interval mean introduces numerical approximation; step convergence is tested separately. This signal compartment consumes no drug mass. The app transfers the published effect model to its own virtual plasma kinetics rather than reproducing the original oral PK model.

## Conditional external-data check

Only plasma means are available in the extracted independent data; individual concentration histories are not. We therefore evaluate the curve conditionally at `Ce = Cp`. This equilibrium approximation is particularly limited for acute scans and does **not** validate the dynamic delay. No parameters are retuned to Ito's results.

| Plasma, ng/mL (SD) | Region | Observed occupancy, % (SD) | Original model, % | PET curve at Ce = Cp, % |
| --- | --- | --- | --- | --- |
| 12.0 (2.1) | Caudate | 57 (4) | 32.08 | 58.17 |
| 12.0 (2.1) | Putamen | 55 (2) | 32.08 | 58.17 |
| 29.0 (2.1) | Caudate | 73 (3) | 53.30 | 77.07 |
| 29.0 (2.1) | Putamen | 69 (3) | 53.30 | 77.07 |

Unweighted mean absolute error falls from **20.81 to 4.12 percentage points** across these four group means. The largest corrected residual is **8.07 points**. The n=2 concentration range 39.6–40.4 ng/mL corresponds to observed caudate 77–79% and putamen 75–77%; it is excluded from MAE. The corrected equilibrium curve still overpredicts these ranges.

This is an external-study aggregate comparison inspected during development, not a prospectively blinded holdout. Two regions share the same participants, so four rows are not four independent experiments. A nonlinear prediction at a mean concentration is not the mean of individual predictions. Reported SDs describe participant variability, not confidence intervals or statistical acceptance limits. The PET endpoint combines D2/3 displacement while the app labels one D2 target. Metabolites, altered endogenous drive, mixed drugs, other populations, repeat exposure, and downstream neural responses remain unvalidated. Source data and all classifications are preserved in `public/data/validation-pet.json`; the report computes errors rather than treating software test success as scientific validity.
