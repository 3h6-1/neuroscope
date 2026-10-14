# Research-informed drug interactions

The interaction engine distinguishes measured enzyme inhibition, derived clearance fractions, and human trial observations. It does not infer a drug's metabolism from its formula. The machine-readable provenance is in [`interaction-evidence.json`](../public/data/interaction-evidence.json); runtime equations are in [`interaction-evidence.js`](../src/interaction-evidence.js).

## Parameters that now affect the simulation

| Parameter | Evidence used | Remaining approximation |
| --- | --- | --- |
| Bupropion parent CYP2D6 Ki | 12.65 µM in pooled human liver microsomes, [Tanaudommongkon et al. (2025), Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC13095643/) | Near-unity microsomal unbound fraction approximated as 1; free plasma substitutes for hepatic exposure. Parent-only effects omit potent circulating metabolites. |
| Fluoxetine parent CYP2D6 Ki | R: 0.86 µM, S: 0.068 µM; incubation free fractions 0.48 and 0.52, [Sager et al. (2014), Table 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC4029899/) | Equal unbound enantiomer proportions; no norfluoxetine, enzyme turnover, or stereoselective disposition. |
| Aripiprazole CYP2D6 fraction | Derived as `1 − 1/2.12 ≈ 0.528` from the quinidine interaction in [ABILIFY prescribing information](https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=634b6431-48ca-480c-a4d8-0ba022bbf0f4&type=display) | Complete selective inhibition and unchanged bioavailability/other clearance assumed; this is not a directly measured fraction. |
| LSD CYP2D6 fraction | Derived as `1 − 1/1.76 ≈ 0.432` from the normal-metabolizer subgroup in [Becker et al. (2025), Table 2](https://ascpt.onlinelibrary.wiley.com/doi/full/10.1002/cpt.3618) | Same complete-blockade assumptions, transfer from oral AUC to virtual plasma kinetics, and no genotype-specific model. |

Sager Table 2 footnote m specifies that the listed inhibition constants are **total** concentrations with separate incubation unbound fractions. The runtime converts once: `Ki,u = Ki,total × fu,inc`, giving 412.8 nM and 35.36 nM. These assay fractions are distinct from plasma protein binding. The plasma free fractions already in the compound catalog remain in use; this implementation does not reproduce the original investigators' full pharmacokinetic models.

For every active external inhibitor `i`, the engine calculates:

```text
w = Σi Σenantiomers (free_plasma_i × assumed_parent_fraction / Ki,u)
remaining enzyme activity = 1 / (1 + w)
clearance / baseline clearance = (1 − fm) + fm / (1 + w)
```

The two terms preserve non-CYP2D6 clearance. A zero inhibitor concentration leaves clearance unchanged; even complete blockade does not eliminate the residual route. Contributions from multiple inhibitors are combined before the substrate fraction is applied. The expression assumes reversible competition, a low-substrate linear-clearance regime and free plasma as the hepatic inhibitor proxy. It does not include Michaelis–Menten saturation of a substrate, liver accumulation, induction or time-dependent inhibition.

The prior universal 100 nM inhibitor scale and universal 0.5 clearance fraction are no longer used for new experiments. A shared pathway without both a curated inhibitor assay and a substrate-specific fraction generates an **unquantified** interaction. Its elimination is left unchanged because the effect is unresolved, not because absence of an interaction was established. Curated parameters require an explicit catalog evidence marker and are never assigned to custom profiles by chemical identity alone. Self-inhibition is omitted rather than added to empirical parent half-lives without a calibrated nonlinear model.

## Study observations are separate from model predictions

The interface displays study population, regimen, endpoint and applicability. Regimens describe published experiments; they are not exposure inputs or recommendations. Human AUC ratios are never automatically multiplied into the time course of another drug or another regimen. The aripiprazole and LSD observations above inform conditional clearance-fraction derivations only.

Additional reference cards record the approximately fivefold desipramine AUC increase during repeated bupropion administration ([prescribing information](https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=28fa8921-7546-4681-89ab-9ec32695e701&type=pdf)), the twofold desipramine AUC with escitalopram ([prescribing information](https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=7d924d16-8a10-411d-be57-97c450f56de7&type=pdf)), and the increased diazepam exposure without a significant change in measured psychomotor response in a six-participant fluoxetine study ([Lemberger et al., 1988](https://pubmed.ncbi.nlm.nih.gov/3128416/)). The last observation remains qualitative here because an exact numerical effect was not established from the accessible primary abstract.

In particular, a weak simulated **parent-only** bupropion interaction must not be interpreted as a weak clinical interaction. The new assay data replace an invented parent constant; they do not supply missing metabolite time courses. Similarly, an AUC increase is not a proportional increase in neuronal firing, subjective intensity or combination risk. Mixture target-response pooling remains an estimated rule even when individual concentration–response assays are measured.

## Verification

Tests check source integrity, µM-to-nM values, single incubation-binding correction, conditional fraction derivation, residual clearance, concentration dependence, multiple-inhibitor competition, unchanged zero-exposure behavior, omitted self-inhibition, unknown/custom profile handling, and the separation of study observations from model predictions. These are numerical and provenance checks, not clinical validation.
