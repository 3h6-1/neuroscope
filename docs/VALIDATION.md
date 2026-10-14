# Experimental comparisons and their boundaries

NeuroScope 3.3 adds a reproducible comparison report and a human-PET-informed occupancy correction. It also retains substantial model discrepancies. No result establishes a validated human brain, individual treatment predictor, or clinical interaction checker.

Run:

```sh
npm test
npm run validate:science
```

The application's **Validation** panel provides the observations, predictions, error summaries and source context. A successful command means the computations and regression checks executed as intended. Biological mismatches remain in the report; they are not hidden by an exit status or an overall “validated” badge.

## Evidence classes

| Class | Meaning | What it does not establish |
| --- | --- | --- |
| Software verification | Equations, units, state handling and numerical behavior satisfy automated checks | Agreement with a biological experiment |
| Published calibration | Parameters were fitted to the cited experiment | Independent prediction of that same experiment |
| Conditional external-data comparison | A separate study supplies observations; some experimental inputs are provided directly | Validation of the full exposure-to-brain pipeline |
| Cross-preparation comparison | A model proxy is compared with an analogous endpoint from another preparation | Interchangeability of event types, species or brain regions |
| Retrospective literature reconstruction | Existing published inputs and calculations are reproduced and compared with previously considered outcomes | A prospectively blinded or participant-matched prediction |
| Unsupported | Required biological state or mechanism is absent | A zero effect or evidence of no interaction |

## Aripiprazole PET occupancy: a scoped improvement

[Kim et al. (2012)](https://doi.org/10.1038/jcbfm.2011.180) supply the calibrated D2/3 PET EC50 **8.63 ng/mL** and effect-compartment rate **0.725 h⁻¹**. A separate effect signal follows plasma and supplies an empirical occupancy estimate. It is not unbound brain concentration, consumes no drug mass, and does not replace the binding Ki or functional assay.

At plasma concentrations supplied by [Ito et al. (2012)](https://doi.org/10.1371/journal.pone.0046488), the conditional equilibrium comparison has mean absolute error **4.117 percentage points**, versus **20.811** for the previous binding-based model. Four regional group means enter this summary; two regions share each participant group. No parameter is retuned to this comparison. Acute concentration histories are unavailable, so `Ce = Cp` is a stated approximation and the dynamic delay is unvalidated. See [the detailed PET audit](research-validation-pet.md).

## Diazepam synaptic decay: a retained mismatch

At a directly supplied bath concentration of 1 µM, the existing curve predicts **112.2%** decay prolongation. An independent acute cortical experiment reports **72.5 ± 12.9% SEM**; a different amygdala preparation gives **49.1%**, derived from reported before/after group means. No ratio uncertainty is invented from missing paired covariance. These preparation differences are not averaged into an unsupported global correction. A chronic pretreatment condition is explicitly **unsupported**, because the model has no tolerance state. See [the neural audit](research-validation-neural.md).

## Bupropion interactions: missing biology made quantitative

The retrospective static desipramine comparison gives an AUC ratio of **1.017** for parent-only inhibition against **5.2 observed**. Adding the study-context metabolite pools gives **1.731**; estimated hepatic scaling yields **3.946–5.086**. The scaling is an animal-derived sensitivity range, not a confidence interval. Inputs combine separate concentration and interaction cohorts; the five reference substrates share the same inhibitor-input set. These calculations do not generate metabolites dynamically in the interactive simulation. See [the interaction audit](research-validation-interactions.md).

## Remaining scope

Reported SDs and SEMs retain their original meanings. They are not model prediction intervals or universal pass limits. Descriptive errors do not establish statistical equivalence. Parameters fitted to observations stay labeled as calibration rather than being counted as independent successes.

Regional firing changes, neural gains, brain partition assumptions, arbitrary mixtures, genotype effects, adaptation, cognition, consciousness and language emergence remain unvalidated. Matching one receptor-occupancy endpoint cannot establish accuracy in those downstream layers. Source data preserve study conditions so later work can add models and reserve genuinely independent observations for testing.
