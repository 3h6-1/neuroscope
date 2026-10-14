# Interaction validation: a deliberately limited retrospective comparison

The live parent-only CYP2D6 model cannot reproduce the clinical bupropion interaction magnitude. We preserve this negative result instead of tuning its parent inhibition constant to absorb missing biology.

The machine-readable [benchmark inputs](../public/data/validation-interactions.json) reconstruct the racemic analysis in [Tanaudommongkon et al. (2025), Tables 1–2](https://pmc.ncbi.nlm.nih.gov/articles/PMC13095643/). For desipramine, parent-only inhibition predicts an AUC ratio of about **1.017**, compared with the observed **5.2**. Adding three measured metabolite pools gives **1.731**. Applying the paper's estimated hepatic enrichment range gives **3.946–5.086**. The last change depends on a substantial animal-to-human distribution assumption.

## What is measured and what is borrowed

- In-vitro competitive inhibition constants come from pooled human liver microsomes. All inputs use nM; the publication reports µM.
- Inhibitor concentrations use Table 1's published unbound plasma values, combining steady-state concentrations from [Kharasch et al. (2020)](https://doi.org/10.1002/cpt.1888) with separate binding assays. They are **not** concentrations measured in each interaction trial.
- CYP2D6 fractions are literature estimates. None is fitted here from the endpoint being compared.
- Clinical AUC ratios and protocols are transcribed from Table 2, with links to the original clinical reports where retrieved. The dextromethorphan result is explicitly marked as verified through the 2025 analysis only.
- The 5.5–9.4 hepatic multiplier derives from rat autoradiography cited by the paper. It is a sensitivity range, not a measured human concentration range or confidence interval.

## Equation and calculation

Let `w = sum(Iu / Ki)` for the selected inhibitors. The mechanistic static model is:

```text
remaining clearance = (1 − fm) + fm / (1 + w)
AUCR = 1 / remaining clearance
```

This relationship assumes a fixed inhibitor concentration, linear substrate disposition and unchanged bioavailability. It compares an integrated plasma-exposure endpoint; it does not imply a corresponding change in synaptic activity or subjective effects.

For the published racemic pools, `w = 238/12650 + 323/970 + 1456/5300 + 2860/11080 = 0.884644`. The parent-only calculation uses only the first term. The published unbound values are used directly because multiplying rounded fractions by rounded totals introduces extra rounding differences. The liver sensitivity multiplies each unbound concentration by each boundary. Its descriptive central result is the average of the two resulting AUC predictions, not a fit or the prediction at the midpoint concentration.

## Why this is not a clinical validation claim

This is a **retrospective literature reconstruction**. The same published analysis already evaluated these clinical outcomes, and it mixes exposure measurements from one population with interaction endpoints from others. Improved agreement supports including metabolites and examining hepatic distribution; it does not establish that NeuroScope predicts a new patient, regimen, drug pair or arbitrary injection. All five reference cases remain visible, including the less satisfactory nebivolol comparison.

The experimental parent free fraction here is about 0.70, while the live catalog retains a label-based 0.16. The benchmark supplies its own measured-context free concentrations and does not silently replace the catalog value. No evidence justifies applying a steady-state metabolite-to-parent ratio immediately after a virtual bolus, so no dynamic metabolite generator or global hepatic multiplier is inferred from this comparison.

Fluoxetine likewise requires norfluoxetine, stereoselective exposure, and additional enzyme mechanisms for a clinical comparison. Its current parent-only estimate is **not clinically validated** by this bupropion dataset. [Sager et al. (2014)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4029899/) used a much richer system to examine those interactions. Aripiprazole/quinidine and LSD/paroxetine AUC observations currently used to derive clearance fractions remain calibration inputs, never independent validation tests.
