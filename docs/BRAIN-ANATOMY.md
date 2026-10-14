# Brain anatomy, display coordinates and provenance

The brain view uses actual **FreeSurfer fsaverage5 pial surfaces**, distributed in the official **Nilearn 0.12.1** repository. Each hemisphere retains 10,242 vertices and 20,480 triangles. The combined local JSON is approximately 1.2 MB and preserves both hemisphere topologies. This is a population-template cortical surface, not a scan of an individual, a complete brain segmentation, or a reconstructed receptor atlas.

The primary Nilearn documentation describes [fsaverage surfaces](https://nilearn.github.io/stable/modules/generated/nilearn.datasets.fetch_surf_fsaverage.html) and the [fsaverage5 template](https://nilearn.github.io/dev/modules/description/fsaverage5.html). The implementation uses the pial surface rather than an inflated representation, so visible folds arise from the provided anatomical geometry. Sulcal-depth values only shade that surface; they do not represent neural activity.

## Exact input records

Retrieved October 13, 2026 from the versioned official repository:

- [Left pial GIFTI](https://raw.githubusercontent.com/nilearn/nilearn/0.12.1/nilearn/datasets/data/fsaverage5/pial_left.gii.gz)
- [Right pial GIFTI](https://raw.githubusercontent.com/nilearn/nilearn/0.12.1/nilearn/datasets/data/fsaverage5/pial_right.gii.gz)
- [Left sulcal-depth GIFTI](https://raw.githubusercontent.com/nilearn/nilearn/0.12.1/nilearn/datasets/data/fsaverage5/sulc_left.gii.gz)
- [Right sulcal-depth GIFTI](https://raw.githubusercontent.com/nilearn/nilearn/0.12.1/nilearn/datasets/data/fsaverage5/sulc_right.gii.gz)

`public/data/brain-surface.json` records the original URL, file size and SHA-256 hash for each compressed input. Its `positionFloat64LE_SHA256` checksums cover the converted coordinate arrays serialized as little-endian IEEE-754 float64 values, independent of JSON number spelling. The source GIFTI coordinates themselves are float32.

Conversion uses only the Python standard library: gzip decompression, XML parsing, base64 decoding, zlib decompression and `struct.unpack`. Point arrays use `NIFTI_INTENT_POINTSET`; triangle arrays use `NIFTI_INTENT_TRIANGLE`. Files declare row-major, little-endian data. Coordinates and sulcal values are rounded to 0.001 for compact JSON; no decimation, smoothing, new folding or topological modification is applied. This JSON is a converted and rounded derivative, not the original GIFTI distribution.

The GIFTI coordinate metadata declares an identity transform from unknown data space to `NIFTI_XFORM_TALAIRACH`. We retain the native fsaverage surface Cartesian coordinates. This app does **not** claim an MNI152 volume-to-surface registration.

## Coordinates and anatomical fidelity

Region definitions use approximate MNI-like coordinates `[x lateral, y anterior, z superior]` in millimetres. The renderer transforms both surface coordinates and markers to Three.js as:

```text
[x, y, z] → [x, z, −y]
```

This is a proper rigid axis rotation with determinant +1. It preserves distances and handedness. It does not rescale, translate, fit or nonlinearly register region coordinates to the surface. Consequently the region centers are **approximate, unregistered annotations**, not segmented atlas parcels. A marker's radius is symbolic and does not estimate the physical size of a nucleus or a cortical area.

The source asset contains cortical pial surfaces only. Version 3.4 adds a separate, **schematic internal anatomy layer**: corpus callosum, thalami, hypothalamus, distinct anterior/posterior pituitary lobes and stalk, hippocampi, amygdalae, caudate, putamen, globus pallidus, ventricles, pineal gland, cerebellum, midbrain, pons, medulla and upper cervical spinal cord. Curves and surfaces illustrate spatial relationships; none is an MRI segmentation or a registered atlas boundary. Structure dimensions and positions are approximate. Bilateral structures are grouped for inspection.

The **Internal anatomy / Regional activity** selector separates these structures from symbolic population markers. Choosing a structure highlights it and provides anatomical roles and source links. Medial and inferior camera presets, hemisphere cutaway, opacity controls and optional labels expose the hypothalamus and pituitary. The CNS-in-body option opens the torso view, which continues the brainstem into a schematic spinal cord and includes thyroid and adrenal glands as separate endocrine organs. The cord in the brain close-up represents only the upper cervical continuation.

Anterior pituitary portal vessels and posterior pituitary axons have distinct illustrative routes. Animated tracers follow playback time; they do not model blood velocity, axonal transport speed, secretion rates or hormone concentrations. The hormone-pathway inspector explains seven selectable pathways and their feedback. See [neuroendocrine anatomy](NEUROENDOCRINE-ANATOMY.md) for physiology and sources. The original quantitative neural and drug models are unchanged by showing or selecting anatomy.

Gray cortex remains anatomical reference, including primary sensory and motor areas that are excluded from the functional network. Only regions explicitly supplied in `REGIONS` receive active markers. No painted surface parcel or vertex-level neural field is inferred from those markers. Visible edges exactly follow the provided `CONNECTIONS` source/target IDs, weights and delays, but their curved paths are decorative model connections rather than diffusion MRI tractography.

## Rendering interface

`createBrainAnatomy({ regions, connections, surface })` in `src/brain-geometry.js` returns:

- `group`: the complete geometry hierarchy.
- `internal`: the separate schematic anatomy interface, with structure selection, labels, route visibility and illustrative playback.
- `setActivityVisible(enabled)`: shows or hides functional markers and their model connections independently of anatomical structures.
- `cortex`: left and right cortical reference meshes.
- `nodeMeshes`: a Map keyed by the supplied string region ID.
- `edges`: one mesh per supplied directed connection, in the input order.
- `setSurfaceOpacity(value)`: sets bounded cortical opacity independently of region activity.
- `setCutaway(enabled)`: hides the right cortical hemisphere to expose medial and deep structures; it does not remove nodes or alter model state.
- `setConnections(enabled)`: changes edge visibility without modifying topology.
- `update(brainStats)`: reads `brainStats.regional` entries containing `id`, `e`, `i` and `delta`.
- `selectRegion(id)`: highlights a supplied region and returns its mesh, or clears selection for an unknown/null ID.
- `dispose()`: releases this model's resources once and detaches it from its scene.

Node color shifts and emissive intensity display the supplied reduced-model activity and change from control. They are not measured fMRI, an electrophysiological field map, a receptor-density image, or a readout of a person's subjective state. Each node and each edge owns its activity material so changing one does not recolor all of them. Shared primitive geometry is local to one model instance, and disposal cannot invalidate another independently created view.

If no surface is supplied, the module can return a visibly labeled procedural fallback. The normal application bundles and passes the real fsaverage5 asset. Missing anatomy is never labeled as a recovered MRI reconstruction.

## Validation

`tests/brain-geometry.test.js` checks source metadata and coordinate checksums; all triangles have valid indices and nonzero area; each mesh edge has two incident faces; and each hemisphere retains Euler characteristic 2. These checks guard the integrity of the closed fsaverage topology during conversion.

Additional internal-anatomy tests check finite geometry, expected spatial relationships, structure/evidence correspondence, selection, independent visibility and resource disposal. They do not establish segmented anatomical accuracy. Body tests verify the cord continuation and the distinction between CNS and peripheral endocrine organs.

Rendering tests check exact axis transformation, marker correspondence, distances and handedness, supplied edge direction, independent materials, cutaway/opacity/selection composition, finite coordinates and transforms, and resource ownership. They establish the integrity of the geometry and its interface, not scientific calibration of the network's assumed regional dynamics or receptor weights.

## Attribution and licenses

Anatomical source: FreeSurfer fsaverage. Distribution: Nilearn developers. Modified derivative: NeuroScope GIFTI-to-JSON conversion, coordinate rounding, rendering and approximate model overlays. No affiliation or endorsement by these projects is implied.

The [Nilearn license](https://raw.githubusercontent.com/nilearn/nilearn/0.12.1/LICENSE) and upstream [FreeSurfer Software License Agreement](https://raw.githubusercontent.com/freesurfer/freesurfer/dev/LICENSE.txt) are retained below and in the asset provenance. The upstream license notice applies to the FreeSurfer-derived portion. The conversion must not be represented as original FreeSurfer data.

### Nilearn distribution license

```text
Copyright (c) The nilearn developers.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. Neither the name of the University nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE REGENTS AND CONTRIBUTORS ``AS IS'' AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED.  IN NO EVENT SHALL THE REGENTS OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
SUCH DAMAGE.
```

### FreeSurfer upstream notice and downloading agreement

All or portions of this licensed product (such portions are the "Software") have been obtained under license from The General Hospital Corporation "MGH" and are subject to the following terms and conditions:

```text
PART B. DOWNLOADING AGREEMENT - License from MGH with Right to Sublicense
("Software License").

1. As used in this Software License, "you" means the individual
   downloading and/or using, reproducing, modifying, displaying and/or
   distributing the Software and the institution or entity which
   employs or is otherwise affiliated with such individual in
   connection therewith. The General Hospital Corporation ("MGH")
   hereby grants you, with right to sublicense, with
   respect to MGH's rights in the software, and data, if any,
   which is the subject of this Software License (collectively, the
   "Software"), a royalty-free, non-exclusive license to use,
   reproduce, make derivative works of, display and distribute the
   Software, provided that:

(a) you accept and adhere to all of the terms and conditions of this
Software License;

(b) in connection with any copy of or sublicense of all or any portion
of the Software, all of the terms and conditions in this Software
License shall appear in and shall apply to such copy and such
sublicense, including without limitation all source and executable
forms and on any user documentation, prefaced with the following
words: "All or portions of this licensed product (such portions are
the "Software") have been obtained under license from The General Hospital
Corporation "MGH" and are subject to the following terms and
conditions:"

(c) you preserve and maintain all applicable attributions, copyright
notices and licenses included in or applicable to the Software;

(d) modified versions of the Software must be clearly identified and
marked as such, and must not be misrepresented as being the original
Software; and

(e) you consider making, but are under no obligation to make, the
source code of any of your modifications to the Software freely
available to others on an open source basis.

2. The license granted in this Software License includes without
   limitation the right to (i) incorporate the Software into
   proprietary programs (subject to any restrictions applicable to
   such programs), (ii) add your own copyright statement to your
   modifications of the Software, and (iii) provide additional or
   different license terms and conditions in your sublicenses of
   modifications of the Software; provided that in each case your use,
   reproduction or distribution of such modifications otherwise
   complies with the conditions stated in this Software License.

3. This Software License does not grant any rights with respect to
   third party software, except those rights that MGH has been
   authorized by a third party to grant to you, and accordingly you
   are solely responsible for (i) obtaining any permissions from third
   parties that you need to use, reproduce, make derivative works of,
   display and distribute the Software, and (ii) informing your
   sublicensees, including without limitation your end-users, of their
   obligations to secure any such required permissions.

4. The Software has been designed for research purposes only and has
   not been reviewed or approved by the Food and Drug Administration
   or by any other agency. YOU ACKNOWLEDGE AND AGREE THAT CLINICAL
   APPLICATIONS ARE NEITHER RECOMMENDED NOR ADVISED. Any
   commercialization of the Software is at the sole risk of the party
   or parties engaged in such commercialization. You further agree to
   use, reproduce, make derivative works of, display and distribute
   the Software in compliance with all applicable governmental laws,
   regulations and orders, including without limitation those relating
   to export and import control.

5. The Software is provided "AS IS" and neither MGH nor any
   contributor to the software (each a "Contributor") shall have any
   obligation to provide maintenance, support, updates, enhancements
   or modifications thereto. MGH AND ALL CONTRIBUTORS SPECIFICALLY
   DISCLAIM ALL EXPRESS AND IMPLIED WARRANTIES OF ANY KIND INCLUDING,
   BUT NOT LIMITED TO, ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR
   A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL
   MGH OR ANY CONTRIBUTOR BE LIABLE TO ANY PARTY FOR DIRECT,
   INDIRECT, SPECIAL, INCIDENTAL, EXEMPLARY OR CONSEQUENTIAL DAMAGES
   HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY ARISING IN ANY WAY
   RELATED TO THE SOFTWARE, EVEN IF MGH OR ANY CONTRIBUTOR HAS
   BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. TO THE MAXIMUM
   EXTENT NOT PROHIBITED BY LAW OR REGULATION, YOU FURTHER ASSUME ALL
   LIABILITY FOR YOUR USE, REPRODUCTION, MAKING OF DERIVATIVE WORKS,
   DISPLAY, LICENSE OR DISTRIBUTION OF THE SOFTWARE AND AGREE TO
   INDEMNIFY AND HOLD HARMLESS MGH AND ALL CONTRIBUTORS FROM AND
   AGAINST ANY AND ALL CLAIMS, SUITS, ACTIONS, DEMANDS AND JUDGMENTS
   ARISING THEREFROM.

6. None of the names, logos or trademarks of MGH or any of
   MGH's affiliates or any of the Contributors, or any funding
   agency, may be used to endorse or promote products produced in
   whole or in part by operation of the Software or derived from or
   based on the Software without specific prior written permission
   from the applicable party.

7. Any use, reproduction or distribution of the Software which is not
   in accordance with this Software License shall automatically revoke
   all rights granted to you under this Software License and render
   Paragraphs 1 and 2 of this Software License null and void.

8. This Software License does not grant any rights in or to any
   intellectual property owned by MGH or any Contributor except
   those rights expressly granted hereunder.

PART C. MISCELLANEOUS

This Agreement shall be governed by and construed in accordance with
the laws of The Commonwealth of Massachusetts without regard to
principles of conflicts of law. This Agreement shall supercede and
replace any license terms that you may have agreed to previously with
respect to FreeSurfer.
```
