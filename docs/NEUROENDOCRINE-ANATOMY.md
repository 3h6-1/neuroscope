# Internal anatomy and neuroendocrine pathways

NeuroScope includes an educational anatomy layer for deep brain structures, the hypothalamus–pituitary connection, the three brainstem divisions, cerebellum, and a short spinal-cord segment. The CNS comprises the brain and spinal cord; peripheral nerves and ganglia belong to the peripheral nervous system. See the [NCI anatomy overview](https://www.cancer.gov/rare-brain-spine-tumor/tumors/anatomy).

The outer cortical surface alone cannot represent this organization. `src/anatomy-data.js` provides individually cited descriptions of the structures and routes. The added internal meshes are **schematic landmarks placed by hand**. They are not segmented from the cortical MRI dataset, atlas-registered boundaries, or patient-specific anatomy. Size, placement, colors, and displayed spinal-cord length are illustrative. A cutaway or transparent cortex exposes these landmarks without claiming a clinical imaging reconstruction.

## Two different pituitary routes

The anterior pituitary is glandular endocrine tissue associated with the brain. Its cells make ACTH, TSH, LH, FSH, GH, and prolactin. Hypothalamic regulatory signals reach it through portal blood. The posterior pituitary contains terminals of hypothalamic neurons: oxytocin and vasopressin are synthesized in the hypothalamus, transported along axons, stored at those terminals, and released into systemic blood. It is incorrect to treat both lobes as identical secretory brain nuclei. Sources: [NICHD signaling research](https://www.nichd.nih.gov/research/atNICHD/Investigators/stojilkovic/research), [Endotext neurohypophyseal anatomy](https://www.ncbi.nlm.nih.gov/books/NBK537591/).

## What the pathways show

| Pathway | Direction of regulation | Essential qualification |
| --- | --- | --- |
| HPA | CRH → ACTH → cortisol | Cortisol provides negative feedback; stress and secretion rhythms are not calculated. |
| HPT | TRH → TSH → thyroid hormones | Thyroid hormones inhibit upstream signaling. |
| HPG | GnRH → LH/FSH → gonadal steroids/inhibin | Feedback varies with reproductive state; estradiol can produce positive feedback before ovulation. |
| GH–IGF-1 | GHRH promotes GH; somatostatin restrains GH; GH promotes IGF-1 | Hypothalamic inputs are parallel, and IGF-1 limits GH secretion. |
| Prolactin | Dopamine restrains lactotroph secretion | This is tonic inhibition rather than a generic three-gland stimulatory axis. |
| Posterior pituitary | Hypothalamic synthesis → axonal transport → terminal release | AVP and oxytocin are shown separately; no anterior-pituitary relay is implied. |

These summaries follow the cited physiology chapters for [ACTH/GH](https://www.ncbi.nlm.nih.gov/books/NBK279116/), [thyroid regulation](https://www.ncbi.nlm.nih.gov/books/NBK278958/), [gonadal feedback](https://www.ncbi.nlm.nih.gov/books/NBK29/), and [NIDDK prolactin regulation](https://www.niddk.nih.gov/health-information/endocrine-diseases/prolactinoma). Additional structure-specific citations are available in the application.

## Limits of this addition

This is qualitative anatomy and pathway education. It adds no endocrine rate constants, hormone concentration curves, inferred hormone changes from a drug dose, or clinical endocrine predictions. In particular, the existing striatal D2 PET occupancy model cannot establish a pituitary exposure or serum prolactin response. Drug interactions and hormone effects would require additional compartment, receptor, secretion, clearance, feedback, and experimental validation data before quantitative coupling is justified.

The landmark layer does not add modeled neurons or solve previously unmodeled sensory, autonomic, spinal, cerebellar, or endocrine circuits. It does not reconstruct every nucleus, tract, meninges, blood vessel, glial population, ventricular boundary, or spinal segment. CSF spaces are identified but fluid flow and pressure are not simulated. Normal circadian and reproductive physiology is described without assigning it to the simulation's entity. Existing pharmacology and neuron-model limitations continue to apply.

Tests check source resolution, the anatomical distinction between glandular and neural pituitary tissue, anterior versus posterior routes, feedback exceptions, and explicit qualitative limitations. These checks prevent common explanatory errors; they do not validate the schematic geometry against an anatomical atlas or validate a quantitative endocrine model.
