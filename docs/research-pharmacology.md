# Research data used for functional drug responses

NeuroScope separates **binding affinity**, **a functional assay response**, and **the estimated transfer to a neural network**. These are different measurements. A binding Ki or Kd is never relabeled as a functional EC50 or IC50. Molecular identity alone supplies none of these response parameters.

The following research endpoints replace assumed response scales in the functional calculation. The catalog keeps the experimental setting, reference response, numerical uncertainty where reported, and source identifiers with each `functionalAssay`. Values apply to those experimental conditions, not universally to a patient's brain.

| Compound / target | Functional midpoint | Maximum response used | Research endpoint and source |
| --- | --- | --- | --- |
| Aripiprazole / D2 | EC50 38 nM | 0.51 of quinpirole maximum | Recombinant human D2, HEK293T cAMP inhibition; [Allen et al. 2011, Fig. 2A](https://pmc.ncbi.nlm.nih.gov/articles/PMC3215024/) |
| Aripiprazole / 5-HT1A | EC50 2.138 nM | 0.681 of 10 µM serotonin response | Human receptor in CHO membranes, GTPγS binding; [Jordan et al. 2002, Table 1](https://pubmed.ncbi.nlm.nih.gov/12063084/) |
| Bupropion / DAT | IC50 550 nM | 1, estimated normalized inhibition ceiling | Rat synaptosome dopamine uptake; [Damaj et al. 2004](https://www.sciencedirect.com/science/article/pii/S0026895X24056517), values reproduced in [Damaj et al. 2010, Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC2939668/) |
| Bupropion / NET | IC50 1900 nM | 1, estimated normalized inhibition ceiling | Rat synaptosome norepinephrine uptake; same study and reproduced table |
| LSD / 5-HT2A | EC50 1.52 nM | 0.94 of serotonin maximum | Recombinant human receptor, calcium mobilization; [Halberstadt et al. 2020, Table 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC9191647/) |
| Diazepam / GABAA | EC50 64 nM | Fractional potentiation 1.91 | Rat α1β2γ2 in Xenopus oocytes with 1 µM GABA; [Boileau and Czajkowski 1999, Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC6782401/) |
| Ketamine / NMDA | IC50 5350 nM | 1, normalized inhibition ceiling | Rat NR1/NR2A in HEK293T, −66 mV, 1 mM Mg2+; [Kotermanski and Johnson 2009, Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC2679254/) |
| Fluoxetine / SERT | IC50 19 nM | 1, estimated normalized inhibition ceiling | Human SERT in HEK293, radiotracer uptake; [Scholze et al. 2000, Table 1](https://pubmed.ncbi.nlm.nih.gov/10869387/) |

Aripiprazole's 5-HT1A value comes from the reported pEC50: `EC50[nM] = 10^(9 − 8.67)`. Diazepam's maximum describes an increment, so the corresponding maximum total current ratio is `1 + 1.91 = 2.91`, under that assay's GABA conditions. Neither is a universal neuronal gain.

## Interpolation and transfer assumptions

Each single-compound assay proxy uses a Hill response:

```text
response(C) = maxResponse × C^h / (midpoint^h + C^h)
```

The default `h = 1` is explicitly **estimated**, not a reported fit. Measured activation/PAM maxima remain labeled as assay measurements; normalized complete-inhibition ceilings are identified separately. The program substitutes its modeled unbound brain concentration for the assay concentration. That transfer, the endogenous background, and the way responses from different assays are combined remain estimates. Reported SD, SEM and fit SE are not human prediction intervals. The current implementation does not fit uncertainty distributions from them.

For binding occupancy, the older Ki/K* fields remain separate. Bupropion, diazepam, ketamine and fluoxetine still have explicitly illustrative binding scales where a verified binding measurement was not imported; adding a functional assay does not turn those occupancy estimates into measured affinities.

## Brain exposure

Bupropion's partition setting changes from an assumed 1 to **1.9**, a steady-state unbound brain-ECF/plasma ratio estimated from rat microdialysis in [Cremers et al. 2016](https://doi.org/10.1124/dmd.115.068932). This replaces an arbitrary setting with an animal-data anchor. Applying it to humans is still an estimated species transfer. Early uptake overshoot and metabolite contributions are not implemented. The other partition settings and all brain equilibration times remain explicitly estimated.

## What this does not establish

The assay curves improve the concentration-to-target part of the model. They do not validate whole-brain activity, subjective experiences, thought generation, a treatment response, or combination safety. Cell type, receptor density and reserve, signaling pathway, membrane voltage and endogenous transmitter levels can change drug effects. Long-term adaptation and active metabolites are major remaining omissions. The separate diazepam synaptic-decay calibration and its transfer limitations are documented in the neural evidence module and the pharmacology guide.
