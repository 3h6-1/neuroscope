// Qualitative anatomical teaching data. These entries do not introduce hormone
// concentrations, endocrine rate constants, or a coupling to drug predictions.
export const ANATOMY_SOURCES = [
  { id: 'nci-cns', title: 'NCI — Brain and Spine Anatomy and Functions', url: 'https://www.cancer.gov/rare-brain-spine-tumor/tumors/anatomy' },
  { id: 'nih-nervous-system', title: 'NIH Curriculum Supplement — Information about the Brain', url: 'https://www.ncbi.nlm.nih.gov/books/NBK20367/' },
  { id: 'ninds-brain', title: 'NINDS — Know Your Brain (NIH publication hosted by UTHealth)', url: 'https://www.uth.edu/stroke-institute/assets/img/resources/know-your-brain-basics.pdf' },
  { id: 'nicHD-pituitary', title: 'NICHD — Stojilkovic Lab: hypothalamus–pituitary signaling', url: 'https://www.nichd.nih.gov/research/atNICHD/Investigators/stojilkovic/research' },
  { id: 'nci-brainstem', title: 'NCI — Brain stem', url: 'https://www.cancer.gov/publications/dictionaries/cancer-terms/def/brain-stem' },
  { id: 'callosal-anatomy', title: 'Zarei et al. (2006) — Functional anatomy of interhemispheric cortical connections', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2100336/' },
  { id: 'basal-ganglia', title: 'Purves et al. — Projections to the Basal Ganglia, Neuroscience', url: 'https://www.ncbi.nlm.nih.gov/books/NBK10988/' },
  { id: 'amygdala-pet', title: 'Morris et al. (1996) — Human amygdala responses to emotional expressions', url: 'https://pubmed.ncbi.nlm.nih.gov/8893004/' },
  { id: 'ninds-cerebellum', title: 'NINDS — Spinocerebellar Ataxias: cerebellar coordination and balance', url: 'https://www.ninds.nih.gov/health-information/disorders/spinocerebellar-ataxias' },
  { id: 'ninds-csf', title: 'NINDS — Syringomyelia: cerebrospinal fluid and the spinal cord', url: 'https://www.ninds.nih.gov/health-information/disorders/syringomyelia' },
  { id: 'pineal-physiology', title: 'Endotext — Physiology of the Pineal Gland and Melatonin', url: 'https://www.ncbi.nlm.nih.gov/books/NBK550972/' },
  { id: 'acth-gh-physiology', title: 'Lim & Khoo (2025), Endotext — Normal Physiology of ACTH and GH Release', url: 'https://www.ncbi.nlm.nih.gov/books/NBK279116/' },
  { id: 'thyroid-physiology', title: 'Mariotti & Beck-Peccoz, Endotext — Hypothalamic–Pituitary–Thyroid Axis', url: 'https://www.ncbi.nlm.nih.gov/books/NBK278958/' },
  { id: 'gonadal-physiology', title: 'Endocrinology — The gonad: gonadotropins and steroid/inhibin feedback', url: 'https://www.ncbi.nlm.nih.gov/books/NBK29/' },
  { id: 'niddk-prolactin', title: 'NIDDK — Prolactinoma: prolactin and dopamine regulation', url: 'https://www.niddk.nih.gov/health-information/endocrine-diseases/prolactinoma' },
  { id: 'posterior-physiology', title: 'Endotext — Diagnostic Tests for Diabetes Insipidus: neurohypophyseal anatomy', url: 'https://www.ncbi.nlm.nih.gov/books/NBK537591/' },
  { id: 'niddk-vasopressin', title: 'NIDDK — Diabetes Insipidus: vasopressin and fluid balance', url: 'https://www.niddk.nih.gov/health-information/kidney-disease/diabetes-insipidus' },
];

export const ANATOMY_SCOPE = {
  classification: 'Qualitative anatomy and endocrine pathways',
  centralNervousSystem: 'The central nervous system (CNS) comprises the brain and spinal cord. Peripheral nerves and ganglia connect it to the body but are outside the CNS.',
  associatedEndocrine: 'The hypothalamus is neural tissue. The anterior pituitary is associated glandular endocrine tissue; the posterior pituitary contains hypothalamic axon terminals. They have different mechanisms of hormone release.',
  geometry: 'Internal meshes are schematic landmarks placed by hand, not MRI segmentations registered to the cortical surface. Colors, boundaries, proportions, and the displayed spinal-cord length are illustrative.',
  simulation: 'These structures and pathways explain anatomy. They do not calculate hormone concentrations, endocrine drug responses, sensory experiences, or additional simulated neurons.',
  sourceIds: ['nci-cns', 'nih-nervous-system', 'nicHD-pituitary', 'posterior-physiology'],
};

export const ANATOMY_STRUCTURES = [
  {
    id: 'cerebrum', name: 'Cerebrum', group: 'Cerebral hemispheres', kind: 'neural tissue',
    role: 'Cortical and deep circuits support movement, perception, memory, and thought.',
    detail: 'The outer surface does not show the full brain: white matter and deep nuclei lie beneath it. Anatomy remains visible even when sensory input is absent from the simulation.',
    sourceIds: ['nci-cns', 'ninds-brain'],
  },
  {
    id: 'corpus-callosum', name: 'Corpus callosum', group: 'Cerebral white matter', kind: 'white matter',
    role: 'Axons connect cortical areas across the two cerebral hemispheres.',
    detail: 'The arch represents a major white-matter commissure, not a separate gray-matter nucleus. Individual fibers are not reconstructed.',
    sourceIds: ['callosal-anatomy'],
  },
  {
    id: 'thalamus', name: 'Thalamus', group: 'Diencephalon', kind: 'neural tissue',
    role: 'Paired nuclei relay and regulate information exchanged with the cortex.',
    detail: 'Many thalamic circuits participate in sensory and motor processing. The schematic groups their distinct nuclei together.',
    sourceIds: ['ninds-brain'],
  },
  {
    id: 'hypothalamus', name: 'Hypothalamus', group: 'Diencephalon', kind: 'neuroendocrine tissue',
    role: 'Links neural regulation to pituitary hormone secretion and homeostasis.',
    detail: 'Below the thalamus, it delivers releasing/inhibiting signals to the anterior pituitary through portal blood vessels and synthesizes the hormones transported along axons to the posterior pituitary.',
    sourceIds: ['nicHD-pituitary', 'posterior-physiology'],
  },
  {
    id: 'anterior-pituitary', name: 'Anterior pituitary', group: 'Associated endocrine gland', kind: 'glandular endocrine tissue',
    role: 'Endocrine cells produce ACTH, TSH, LH, FSH, GH, and prolactin.',
    detail: 'Hypothalamic signals reach these cells through portal blood vessels. This glandular lobe is not modeled as a brain neuron region.',
    sourceIds: ['nicHD-pituitary'],
  },
  {
    id: 'posterior-pituitary', name: 'Posterior pituitary', group: 'Neurohypophysis', kind: 'neural endocrine tissue',
    role: 'Stores and releases oxytocin and vasopressin made in hypothalamic neurons.',
    detail: 'Hormones travel down axons to terminals here, then enter systemic blood. The posterior lobe is not their principal synthesis site.',
    sourceIds: ['posterior-physiology'],
  },
  {
    id: 'pituitary-stalk', name: 'Pituitary stalk (infundibulum)', group: 'Hypothalamus–pituitary connection', kind: 'neurovascular connection',
    role: 'Carries neural and vascular connections between hypothalamus and pituitary.',
    detail: 'Axonal transport to the posterior lobe and portal blood flow to the anterior lobe are distinct routes, represented schematically.',
    sourceIds: ['nicHD-pituitary'],
  },
  {
    id: 'hippocampus', name: 'Hippocampus', group: 'Medial temporal structures', kind: 'neural tissue',
    role: 'Participates in forming and organizing memories.',
    detail: 'The paired curved landmarks summarize the hippocampal formation; cellular layers and subfields are omitted.',
    sourceIds: ['ninds-brain'],
  },
  {
    id: 'amygdala', name: 'Amygdala', group: 'Medial temporal structures', kind: 'neural tissue',
    role: 'Participates in emotional processing, including responses to threat.',
    detail: 'Each landmark stands for a complex of nuclei. A highlighted amygdala does not measure a particular emotion or prove a subjective experience.',
    sourceIds: ['amygdala-pet'],
  },
  {
    id: 'caudate', name: 'Caudate nucleus', group: 'Basal ganglia', kind: 'neural tissue',
    role: 'Together with putamen, forms the dorsal striatum, a major basal-ganglia input region.',
    detail: 'Cortical, thalamic, and brainstem inputs converge in striatal circuits. The anatomy overlay does not add a new fitted drug-response model.',
    sourceIds: ['basal-ganglia'],
  },
  {
    id: 'putamen', name: 'Putamen', group: 'Basal ganglia', kind: 'neural tissue',
    role: 'A striatal input structure in circuits involving the cortex, pallidum, and thalamus.',
    detail: 'The caudate and putamen are displayed separately; this does not imply that either operates in isolation.',
    sourceIds: ['basal-ganglia'],
  },
  {
    id: 'globus-pallidus', name: 'Globus pallidus', group: 'Basal ganglia', kind: 'neural tissue',
    role: 'Pallidal circuits help regulate basal-ganglia output.',
    detail: 'The internal segment is a major output structure. Internal and external segments are not separately resolved in this schematic.',
    sourceIds: ['basal-ganglia'],
  },
  {
    id: 'ventricles', name: 'Ventricular system', group: 'Cerebrospinal fluid spaces', kind: 'fluid spaces',
    role: 'Connected brain cavities contain cerebrospinal fluid (CSF).',
    detail: 'CSF also surrounds the brain and spinal cord. The translucent shape marks fluid spaces; it is not neural tissue or a fluid-pressure simulation.',
    sourceIds: ['ninds-csf'],
  },
  {
    id: 'pineal', name: 'Pineal gland', group: 'Epithalamus', kind: 'endocrine tissue',
    role: 'Produces melatonin as part of circadian signaling.',
    detail: 'Its normal regulation involves a pathway from the hypothalamic circadian clock through sympathetic connections. Light entrainment and melatonin secretion are not simulated.',
    sourceIds: ['pineal-physiology'],
  },
  {
    id: 'cerebellum', name: 'Cerebellum', group: 'Hindbrain', kind: 'neural tissue',
    role: 'Supports coordination and balance.',
    detail: 'The posterior-inferior landmark includes simplified surface folds. Deep cerebellar nuclei and the full microcircuit are not reconstructed.',
    sourceIds: ['ninds-cerebellum'],
  },
  {
    id: 'midbrain', name: 'Midbrain', group: 'Brainstem', kind: 'neural tissue',
    role: 'The upper division of the brainstem, linking forebrain and lower brainstem pathways.',
    detail: 'It is anatomically distinct from the pons and medulla. Individual nuclei and cranial-nerve pathways are omitted.',
    sourceIds: ['nci-brainstem'],
  },
  {
    id: 'pons', name: 'Pons', group: 'Brainstem', kind: 'neural tissue',
    role: 'The middle brainstem division between midbrain and medulla.',
    detail: 'Brainstem circuits coordinate vital, motor, and sensory functions. The anatomical landmark does not simulate every circuit within it.',
    sourceIds: ['nci-brainstem'],
  },
  {
    id: 'medulla', name: 'Medulla oblongata', group: 'Brainstem', kind: 'neural tissue',
    role: 'The lower brainstem division, continuous with the spinal cord.',
    detail: 'Brainstem functions include regulation of breathing, heart rate, and blood pressure. This mesh is not an autonomic physiology model.',
    sourceIds: ['nci-brainstem'],
  },
  {
    id: 'spinal-cord', name: 'Spinal cord', group: 'Central nervous system', kind: 'neural tissue',
    role: 'Connects brain pathways with nerves serving the body.',
    detail: 'The cord belongs to the CNS. Peripheral nerves extend beyond it; the displayed short segment does not represent the full cord or its segmental anatomy.',
    sourceIds: ['nci-cns'],
  },
];

// Steps show causal routes, not equally timed events. Organ IDs that match an
// anatomy structure can be used by the UI to focus the corresponding landmark.
export const ENDOCRINE_PATHWAYS = [
  {
    id: 'hpa', name: 'HPA axis · stress regulation',
    summary: 'Hypothalamic CRH stimulates pituitary ACTH, which stimulates adrenal cortisol secretion.',
    steps: [
      { organ: 'hypothalamus', label: 'Hypothalamus', signal: 'CRH (corticotropin-releasing hormone)', route: 'Portal blood → anterior pituitary', effect: 'stimulates' },
      { organ: 'anterior-pituitary', label: 'Anterior pituitary · corticotrophs', signal: 'ACTH (adrenocorticotropic hormone)', route: 'Systemic blood → adrenal cortex', effect: 'stimulates' },
      { organ: 'adrenal-cortex', label: 'Adrenal cortex', signal: 'Cortisol', route: 'Systemic blood → tissues and feedback sites', effect: 'releases' },
    ],
    feedback: 'Cortisol reduces CRH and ACTH drive through negative feedback.',
    limits: ['Qualitative route only. Circadian/ultradian rhythms, vasopressin co-regulation, stress responses, and cortisol concentrations are not computed.'],
    sourceIds: ['acth-gh-physiology'],
  },
  {
    id: 'hpt', name: 'HPT axis · thyroid regulation',
    summary: 'Hypothalamic TRH stimulates pituitary TSH; TSH stimulates thyroid hormone production.',
    steps: [
      { organ: 'hypothalamus', label: 'Hypothalamus', signal: 'TRH (thyrotropin-releasing hormone)', route: 'Portal blood → anterior pituitary', effect: 'stimulates' },
      { organ: 'anterior-pituitary', label: 'Anterior pituitary · thyrotrophs', signal: 'TSH (thyroid-stimulating hormone)', route: 'Systemic blood → thyroid', effect: 'stimulates' },
      { organ: 'thyroid', label: 'Thyroid gland', signal: 'T4 (thyroxine) and T3 (triiodothyronine)', route: 'Systemic blood → tissues', effect: 'releases' },
    ],
    feedback: 'Thyroid hormones suppress hypothalamic TRH and pituitary TSH signaling.',
    limits: ['No thyroid concentrations, tissue T4-to-T3 conversion, disease state, or drug–thyroid response is calculated.'],
    sourceIds: ['thyroid-physiology'],
  },
  {
    id: 'hpg', name: 'HPG axis · reproductive regulation',
    summary: 'Pulsatile GnRH drives pituitary LH and FSH, which regulate gonadal activity.',
    steps: [
      { organ: 'hypothalamus', label: 'Hypothalamus', signal: 'GnRH (gonadotropin-releasing hormone)', route: 'Portal blood → anterior pituitary', effect: 'stimulates' },
      { organ: 'anterior-pituitary', label: 'Anterior pituitary · gonadotrophs', signal: 'LH and FSH', route: 'Systemic blood → gonads', effect: 'stimulates' },
      { organ: 'gonads', label: 'Ovaries or testes', signal: 'Gonadal steroids and inhibin', route: 'Systemic blood → tissues and feedback sites', effect: 'releases' },
    ],
    feedback: 'Steroid feedback depends on reproductive state. Sustained high estradiol can trigger positive feedback before ovulation; inhibin suppresses FSH. A universal negative-feedback rule would be incorrect.',
    limits: ['No sex, menstrual-cycle phase, puberty, pregnancy, fertility, or pulsatile hormone dynamics is assigned to the simulated entity.'],
    sourceIds: ['gonadal-physiology'],
  },
  {
    id: 'gh-igf1', name: 'GH–IGF-1 axis · growth signaling',
    summary: 'GHRH stimulates and somatostatin inhibits GH release. GH promotes IGF-1 production.',
    steps: [
      { organ: 'hypothalamus', label: 'Hypothalamus · stimulatory route', signal: 'GHRH (growth hormone-releasing hormone)', route: 'Portal blood → anterior pituitary', effect: 'stimulates', parallelGroup: 'hypothalamic-gh-inputs' },
      { organ: 'hypothalamus', label: 'Hypothalamus · inhibitory route', signal: 'Somatostatin', route: 'Portal blood → anterior pituitary (parallel inhibitory input)', effect: 'inhibits', parallelGroup: 'hypothalamic-gh-inputs' },
      { organ: 'anterior-pituitary', label: 'Anterior pituitary · somatotrophs', signal: 'GH (growth hormone)', route: 'Systemic blood → liver and other tissues', effect: 'stimulates' },
      { organ: 'liver-and-tissues', label: 'Liver and other tissues', signal: 'IGF-1 (insulin-like growth factor 1)', route: 'Endocrine and local signaling', effect: 'releases' },
    ],
    feedback: 'IGF-1 feeds back to limit GH secretion at pituitary and hypothalamic levels.',
    limits: ['The two hypothalamic inputs act in parallel. This diagram does not model growth, secretion pulses, ghrelin, or IGF-binding proteins.'],
    sourceIds: ['acth-gh-physiology'],
  },
  {
    id: 'prolactin', name: 'Prolactin · tonic dopamine inhibition',
    summary: 'Hypothalamic dopamine normally restrains prolactin secretion from pituitary lactotrophs.',
    steps: [
      { organ: 'hypothalamus', label: 'Hypothalamus', signal: 'Dopamine inhibits lactotroph secretion', route: 'Portal blood → anterior pituitary', effect: 'inhibits' },
      { organ: 'anterior-pituitary', label: 'Anterior pituitary · lactotrophs', signal: 'Prolactin', route: 'Systemic blood → target tissues', effect: 'releases' },
      { organ: 'mammary-gland', label: 'Mammary gland', signal: 'Prolactin supports milk production in the appropriate physiological state', route: 'Target-tissue response', effect: 'responds' },
    ],
    feedback: 'This is tonic inhibition, not the same three-gland stimulatory sequence as the thyroid or adrenal axes.',
    limits: ['Medicines affecting dopamine can alter prolactin, but striatal D2 occupancy alone cannot predict pituitary exposure or a serum prolactin value. No numerical endocrine drug effect is inferred here.'],
    sourceIds: ['niddk-prolactin'],
  },
  {
    id: 'vasopressin', name: 'Posterior pathway · vasopressin / ADH',
    summary: 'Vasopressin is synthesized in hypothalamic neurons, transported in axons, and released from posterior pituitary terminals.',
    steps: [
      { organ: 'hypothalamus', label: 'Hypothalamic magnocellular neurons', signal: 'Synthesis of vasopressin (AVP; antidiuretic hormone, ADH)', route: 'Axonal transport through the pituitary stalk', effect: 'synthesizes' },
      { organ: 'posterior-pituitary', label: 'Posterior pituitary · axon terminals', signal: 'Stored AVP is released', route: 'Systemic blood → kidneys', effect: 'releases' },
      { organ: 'kidney', label: 'Kidneys', signal: 'AVP promotes water conservation', route: 'Renal target response', effect: 'responds' },
    ],
    feedback: 'Release responds to osmotic and circulatory signals; water conservation helps restore fluid balance.',
    limits: ['No osmolality, blood-volume, renal transport, or vasopressin concentration model is implemented.'],
    sourceIds: ['posterior-physiology', 'niddk-vasopressin'],
  },
  {
    id: 'oxytocin', name: 'Posterior pathway · oxytocin',
    summary: 'Oxytocin also originates in hypothalamic neurons and is stored and released at posterior pituitary axon terminals.',
    steps: [
      { organ: 'hypothalamus', label: 'Hypothalamic magnocellular neurons', signal: 'Synthesis of oxytocin', route: 'Axonal transport through the pituitary stalk', effect: 'synthesizes' },
      { organ: 'posterior-pituitary', label: 'Posterior pituitary · axon terminals', signal: 'Stored oxytocin is released', route: 'Systemic blood → peripheral targets', effect: 'releases' },
    ],
    feedback: 'Posterior secretion is driven by hypothalamic neuronal activity; it does not require an anterior-pituitary releasing-hormone relay.',
    limits: ['This display covers the synthesis and release route only. It does not calculate childbirth, lactation, central oxytocin signaling, or social behavior.'],
    sourceIds: ['posterior-physiology', 'nicHD-pituitary'],
  },
];
