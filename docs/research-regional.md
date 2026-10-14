# Regional receptor evidence and remaining estimates

NeuroScope uses human PET reference maps to constrain **spatial differences in target sensitivity**. These data replace 120 of 300 manually selected regional weights. They do not replace the estimated conversion from receptor activity to population firing, establish a causal drug-to-fMRI model, or validate simulated cognition.

## Imported measurements

The six maps come from the author-provided [Hansen et al. (2022) receptor atlas](https://doi.org/10.1038/s41593-022-01186-3), using its named Cammoun/Lausanne `scale033` parcels. The atlas's main analyses were cortical; the original serotonin and benzodiazepine studies also supplied whole-brain maps. NeuroScope's use of selected subcortical parcels is an additional model adaptation.

| Target | Human PET reference | Atlas sample | Imported parameter | Applied nodes |
| --- | --- | ---: | --- | --- |
| SERT | [Beliveau et al. 2017](https://doi.org/10.1523/JNEUROSCI.2830-16.2016), [11C]DASB | 100 | Bmax, pmol/mL; PET calibrated with postmortem autoradiography | 24 cortical/hippocampal/amygdala/caudate proxies |
| 5-HT1A | [Beliveau et al. 2017](https://doi.org/10.1523/JNEUROSCI.2830-16.2016), [11C]CUMI-101 | 8 | Bmax, pmol/mL; PET calibrated with postmortem autoradiography | Same 24 |
| 5-HT2A | [Beliveau et al. 2017](https://doi.org/10.1523/JNEUROSCI.2830-16.2016), [11C]CIMBI-36 | 29 | Bmax, pmol/mL; PET calibrated with postmortem autoradiography | Same 24 |
| GABAA benzodiazepine sites | [Nørgaard et al. 2021](https://doi.org/10.1016/j.neuroimage.2021.117878), [11C]flumazenil | 16 | Bmax, pmol/mL; PET calibrated with postmortem autoradiography | Same 24 |
| D2/3 | [Jaworska et al. 2020](https://doi.org/10.1038/s41386-020-0662-7), [18F]fallypride | 49 | Nondisplaceable binding potential, BP_ND | 22 extrastriatal proxies only |
| DAT | [Sasaki et al. 2012](https://doi.org/10.2967/jnumed.111.101626), [18F]FE-PE2I | 6 | BP_ND | 2 caudate proxies only |

Sample sizes are those of the released atlas subset and its Table S3, not necessarily those of the full original study. For example, the cited D2/3 study enrolled 58 young participants, including high- and low-externalizing-trait groups; the DAT quantification study enrolled 10 men. Neither dataset is a demographically universal reference. PET binding is affected by tracer selectivity, endogenous transmitters, image resolution and kinetic estimation. BP_ND is not an absolute receptor count. The GABAA map covers benzodiazepine-sensitive sites, not all inhibitory receptors; D2/3 is a proxy for the model's D2 target.

## From atlas values to the simulation

The source JSON retains every original numerical value for all 83 parcels, anatomical labels, tracer, sample size, measurement type, source URL, immutable upstream revision and SHA-256 hashes. Only eligible parcels enter the simulation. Negative values are preserved in the reference dataset; they are not silently replaced with zero or treated as physical densities.

For target `t` and simulated region `r`:

```
rawMean(r,t) = arithmetic mean of the explicitly named matching parcel values
weight(r,t) = rawMean(r,t) / referenceMean(t)
```

`referenceMean` is the equal-weight mean of all 68 bilateral cortical atlas parcels for SERT, 5-HT1A, 5-HT2A, GABAA and D2/3. For DAT it is the mean of the four bilateral caudate/putamen parcels, because extrastriatal binding is low and can be negative. No tracers or measurement units are combined across targets. A weight of 1 means the selected reference's mean, not full receptor occupancy or a measured firing gain. Changing the normalization reference would change the model's overall effect magnitude.

**The normalization, equal weighting of parcels and proportional density-to-sensitivity relationship are estimates.** They preserve within-target spatial ratios; they are not coefficients fitted to a pharmacological experiment. The previous hand-selected network gain/sign coefficients remain downstream, explicitly marked estimated.

## Anatomical mapping

Coordinates in the rendered brain remain schematic and are never used as MNI coordinates to sample these maps. Mapping uses hemisphere and names, as inspectable in `src/regional-evidence.js`:

| Simulated node | Named parcel(s), separately in each hemisphere |
| --- | --- |
| Dorsolateral prefrontal | rostralmiddlefrontal, caudalmiddlefrontal |
| Ventromedial prefrontal | medialorbitofrontal |
| Orbitofrontal | lateralorbitofrontal |
| Anterior cingulate | rostralanteriorcingulate, caudalanteriorcingulate |
| Posterior cingulate | posteriorcingulate |
| Precuneus | precuneus |
| Inferior parietal | inferiorparietal |
| Inferior frontal | parsopercularis, parstriangularis, parsorbitalis |
| Lateral temporal association | middletemporal, inferiortemporal |
| Hippocampus | hippocampus |
| Amygdala | amygdala |
| Associative striatum | caudate, a whole-structure proxy |

These correspondences are anatomical approximations, not a functional parcellation registration. Multi-parcel nodes use equal weights, without fabricating regional volumes. Whole caudate does not isolate associative striatum. Left and right measurements are retained independently.

## Explicitly unfilled gaps

- Mediodorsal thalamus, cognitive cerebellar territory, dorsal raphe and locus coeruleus keep estimated weights. Whole thalamus/brainstem values would not isolate those nuclei, so they are not substituted.
- Striatal D2 remains estimated: the selected D2/3 protocol addressed extrastriatal binding. Extrastriatal DAT remains estimated rather than deriving densities from low/negative binding estimates.
- NET remains estimated because the available [11C]MRB parcel values include low/negative BP_ND and have no imported validated gain calibration. Generic NMDA, adenosine and nicotinic targets remain estimated; a subtype-specific or uncertain tracer map is not automatically a complete receptor-family map.
- Regional excitatory/inhibitory gains, effect signs, time constants, connectivity, conduction delays, noise and cognitive mappings remain model assumptions. There is no cell-type or cortical-layer separation, individual PET scan, fitted dose-response-to-region relationship, or independent experimental validation of predicted neural activity.
- Inter-individual variation and source-map uncertainty are not propagated into confidence intervals. The displayed value is a group reference, not a precision estimate for a particular person.

## Reproducibility and data license

Run `python3 scripts/import_regional_receptors.py` to rebuild `public/data/regional-receptors.json`. This uses Python's standard library, downloads only pinned small CSV/metadata files, checks SHA-256 for each, verifies parcel order, and deterministically writes the extract. Upstream revision: `f8b41da92a733f99368c1f39d4959731aa1316c1`. Tests require no network.

The extracted dataset retains **CC BY-NC-SA 4.0** from the upstream repository; see [the full data license and attribution](REGIONAL-DATA-LICENSE.md). This data-specific license allows noncommercial redistribution with attribution and share-alike terms; it does not relicense independently written source code. The original authors do not endorse the simulation.
