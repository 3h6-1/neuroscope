# Synaptic calibration audit

## Implemented experimental anchor

[Cao et al., Scientific Reports 8:10341 (2018)](https://doi.org/10.1038/s41598-018-28754-7), Results and Figures 3–4, measured spontaneous inhibitory postsynaptic current decay in cultured rat hippocampal neurons after at least 10 minutes of bath application. The endpoint is **peak-to-25% duration**, not an exponential time constant.

| Diazepam bath concentration (nM) | Duration mean (ms) | SD (ms) | Cells |
| --- | --- | --- | --- |
| 0 | 41 | 9 | 17 |
| 10 | 63 | 13 | 6 |
| 100 | 65 | 16 | 6 |
| 1000 | 87 | 27 | 5 |

The paper reports no significant duration effect at 1–3 nM. This does not establish an exact zero response.

## Model transformations and remaining estimates

The implementation uses `tau = duration / ln(4)`, because `exp(-duration/tau) = 0.25`. A single exponential is a model reduction, not a fit claimed by the original study. Baseline tau is therefore approximately 29.58 ms.

Between the three positive measured anchors, durations are interpolated linearly against log concentration. Between zero and 10 nM, linear concentration interpolation supplies a continuous estimated response; it does not claim a statistically detectable low-concentration effect. Above 1000 nM, the final anchor is held and the output is labeled outside the measured range. Sample SDs are displayed only at measured nodes; they are not human prediction intervals.

The PK model's virtual unbound brain concentration substitutes for bath concentration. This translation, instantaneous equilibration, constant event amplitude, application of rat hippocampal kinetics to every inhibitory connection, and the generic circuit itself remain assumptions. Do not interpret the resulting spikes as human measurements.

Only identified diazepam with its explicit calibration marker can use the endpoint. Any other active GABAA contributor disables this single-drug calibration. Unmatched drugs and mixtures retain estimated generic modulation. The calibrated path removes the previous GABA amplitude gain and direct negative-current bias, preventing duplicate application of the same effect.

Current checkpoints retain the selected decay and replay exactly. Older checkpoints without this field are explicitly migrated to the reference decay; their continuation differs from the older model, which used an assumed 10 ms inhibitory decay.

## Other priorities identified in review

NMDA-dependent current should be separated from AMPA-dependent current before interpreting channel blockade mechanistically. [Jahr and Stevens (1990)](https://doi.org/10.1523/JNEUROSCI.10-09-03178.1990) provide a measured magnesium/voltage gating relationship. That equation alone cannot supply the missing conductance density, receptor composition, or a validated ketamine-current transfer for this generic circuit.

Measured receptor binding, functional EC50, and synaptic decay are different endpoints. Replacing an assumed direct-current coefficient with a binding affinity or an unrelated assay maximum would obscure rather than eliminate the remaining assumptions. Uncalibrated monoamine current gains, network connectivity, receptor distributions and cognitive coupling must continue to be labeled estimates.
