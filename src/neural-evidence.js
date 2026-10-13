/** Endpoint-matched experimental anchors, with model transformations separated.
 * Cao et al. (2018), Scientific Reports 8:10341, Results/Figs. 3–4.
 * https://doi.org/10.1038/s41598-018-28754-7
 * These are cultured rat hippocampal sIPSCs, not human cortical calibration.
 */
export const DIAZEPAM_NEURAL_CALIBRATION = Object.freeze({
  id: 'diazepam-rat-hippocampal-sipsc-2018',
  sourceUrl: 'https://doi.org/10.1038/s41598-018-28754-7',
  citation: 'Cao et al. (2018), Scientific Reports 8:10341, Results and Figures 3–4',
  preparation: 'Cultured rat hippocampal neurons; bath application for at least 10 minutes before recording.',
  endpoint: 'Spontaneous IPSC decay duration from peak to 25% of peak; mean ± SD across cells.',
  points: Object.freeze([
    Object.freeze({ concentrationNM: 0, durationMs: 41, sdMs: 9, cells: 17 }),
    Object.freeze({ concentrationNM: 10, durationMs: 63, sdMs: 13, cells: 6 }),
    Object.freeze({ concentrationNM: 100, durationMs: 65, sdMs: 16, cells: 6 }),
    Object.freeze({ concentrationNM: 1000, durationMs: 87, sdMs: 27, cells: 5 }),
  ]),
  transformation: 'Assume a single exponential: tau = peak-to-25% duration / ln(4). The paper reports duration, not this derived tau.',
  transferAssumption: 'Virtual unbound brain concentration substitutes for bath concentration; rat-culture kinetics are applied to a generic E/I circuit. Instantaneous equilibration, constant event amplitude and single-exponential shape are assumptions.',
});

export const BASELINE_INHIBITION_DECAY_MS = DIAZEPAM_NEURAL_CALIBRATION.points[0].durationMs / Math.log(4);

/** Interpolate durations, then derive an equivalent exponential decay constant.
 * Only table nodes are measurements. No fitted EC50 or human effect is inferred.
 * Above the sampled range the last value is held, not extrapolated.
 */
export function diazepamInhibitionDecay(concentrationNM) {
  if (!Number.isFinite(concentrationNM) || concentrationNM < 0) throw new RangeError('Diazepam concentration must be finite and nonnegative');
  const { points, id: calibrationId, sourceUrl } = DIAZEPAM_NEURAL_CALIBRATION;
  const node = points.find(point => point.concentrationNM === concentrationNM);
  let durationMs, status;
  if (node) {
    durationMs = node.durationMs;
    status = 'measured-endpoint-derived-tau';
  } else if (concentrationNM < points[1].concentrationNM) {
    durationMs = points[0].durationMs + concentrationNM / points[1].concentrationNM * (points[1].durationMs - points[0].durationMs);
    status = 'estimated-low-concentration-interpolation';
  } else if (concentrationNM > points.at(-1).concentrationNM) {
    durationMs = points.at(-1).durationMs;
    status = 'capped-outside-measured-range';
  } else {
    const upper = points.findIndex(point => point.concentrationNM > concentrationNM);
    const a = points[upper - 1], b = points[upper];
    const fraction = Math.log(concentrationNM / a.concentrationNM) / Math.log(b.concentrationNM / a.concentrationNM);
    durationMs = a.durationMs + fraction * (b.durationMs - a.durationMs);
    status = 'estimated-log-concentration-interpolation';
  }
  return {
    inhibitionDecayMs: durationMs / Math.log(4),
    evidence: {
      status, calibrationId, concentrationNM, durationMs, sourceUrl,
      measuredAnchor: Boolean(node),
      interpolated: status.startsWith('estimated-'),
      capped: status === 'capped-outside-measured-range',
      extrapolated: false,
      measuredPositiveRangeNM: [10, 1000],
      ...(node ? { measuredDurationSdMs: node.sdMs, cells: node.cells } : {}),
      interpretation: `${DIAZEPAM_NEURAL_CALIBRATION.transformation} ${DIAZEPAM_NEURAL_CALIBRATION.transferAssumption}`,
    },
  };
}

/** Use this single-drug experiment only for its identified compound/endpoint.
 * Any active unmatched GABAA contributor disables it; combination kinetics
 * cannot be constructed by adding independently measured decay durations.
 */
export function gabaDecayCalibration(target = {}) {
  const contributors = (target.contributors || []).filter(c => c.concentrationNM > 0 || c.occupancy > 0 || c.weight > 0);
  if (!contributors.length || !contributors.every(c => c.id === 'diazepam' && c.action === 'pam' && c.neuralCalibrationId === DIAZEPAM_NEURAL_CALIBRATION.id && Number.isFinite(c.concentrationNM) && c.concentrationNM >= 0)) return null;
  return diazepamInhibitionDecay(contributors.reduce((sum, c) => sum + c.concentrationNM, 0));
}
