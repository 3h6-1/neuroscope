# Independent synaptic comparisons

The numerical observations in [validation-neural.json](../public/data/validation-neural.json) were not used to construct NeuroScope's diazepam decay curve. They test its transfer across preparations. They do **not** validate the generic spiking network, regional activity, cognition or human responses.

## Data and endpoint

[Chapman et al. (2025), Figure 1](https://doi.org/10.3389/fncel.2025.1624813) report mIPSC decay potentiation after acute 1 µM diazepam in cultured rat cortical pyramidal neurons: **72.5 ± 12.9% SEM** after vehicle pretreatment and **25.6 ± 7.48%** after seven days of diazepam pretreatment; five cells per condition from three cultures. These are published means of within-cell percentage changes, not ratios of group means.

[Geracitano et al. (2012), Results](https://doi.org/10.3389/fncir.2012.00032) report mouse amygdala unitary IPSC decay constants of **16.3 ± 3.9 ms** before and **24.3 ± 4.2 ms** during 1 µM diazepam, three recorded pairs. The derived group-mean change is **49.08%**. Paired covariance is unavailable, so no uncertainty is invented for that ratio. Experiments used acute slices at 34 ± 1 °C with approximately 12.5 minutes of drug application.

The JSON records methods, source locations, direct versus derived endpoints, sample sizes and uncertainty types. Values were transcribed from numerical prose/captions, not estimated from plots.

## Frozen-model comparison

The existing function `diazepamInhibitionDecay` derives a single-exponential time constant from peak-to-25% durations in a different hippocampal culture experiment. For a matched **model proxy**, use:

```text
predicted change (%) = 100 × (tau(1000 nM) / tau(0 nM) − 1)
                    = 100 × (87 / 41 − 1)
                    = 112.1951%
```

This is the same value whether calculated from the model's duration or derived tau, because the `ln(4)` factors cancel. Compared with the acute cortical observation, the residual is **+39.70 percentage points**; compared with the amygdala ratio, **+63.12 points**. These discrepancies are retained. The observations concern different event types, cell populations, preparations and, for amygdala, species. A common response direction does not establish accurate transfer of magnitude.

The chronic experiment is classified **unsupported**, not as an ordinary prediction: a concentration-only curve has no way to reproduce history-dependent tolerance. Its 112.20% acute reference differs by +86.60 points, but that is a counterfactual diagnostic, not the result of simulating a seven-day regimen.

## Why these data do not silently retune the model

Fitting a global multiplier to these independent observations would turn them into calibration data and would overwrite a preparation-specific curve with a mixture of incompatible endpoints. A single chronic endpoint cannot identify tolerance onset and recovery rates. No such adjustment is made. Future improvements require explicit preparation/subtype and exposure-history models plus additional observations reserved for testing.

The report displays descriptive residuals without a universal pass threshold, p-value or claim of equivalence. Experimental SEM omits calibration uncertainty, between-preparation variability and uncertainty in the current transformation. It is not a model prediction interval. Bath concentration is supplied directly to the decay function: this audit does not test brain exposure, PK, receptor binding or the full circuit. Returning the original Cao calibration anchors exactly is separately a software consistency check and is excluded from independent validation.
