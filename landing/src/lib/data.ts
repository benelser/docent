// The 29 canonical scenes — grouped by cluster, in the kit's canonical order.
// Each entry: id, label (display), cue (the "reach for it when" one-liner),
// defaultRut flag. Stills live at /stills/<id>.jpg.

export type Cluster = {
	name: string;
	cue: string;
	scenes: SceneEntry[];
};

export type SceneEntry = {
	id: string;
	cue: string;
	rut?: boolean;
};

export const CLUSTERS: Cluster[] = [
	{
		name: 'connection',
		cue: 'how the parts relate.',
		scenes: [
			{
				id: 'structure',
				cue: 'the subject IS its components and how they connect (node-and-edge diagram).',
				rut: true
			},
			{
				id: 'walkthrough',
				cue: 'WHO passes WHAT to WHOM and WHEN (actors over time).'
			},
			{ id: 'tree', cue: 'parent–child and the levels mean something (a taxonomy).' },
			{ id: 'map', cue: 'WHERE matters — geography, topology, proximity.' }
		]
	},
	{
		name: 'time',
		cue: 'order along an axis.',
		scenes: [
			{ id: 'timeline', cue: 'the GAPS between dates are part of the argument.' },
			{
				id: 'progression',
				cue: "the order matters but the dates don't (ordinal stages along a track)."
			}
		]
	},
	{
		name: 'flow',
		cue: 'systems in motion.',
		scenes: [
			{ id: 'diff', cue: 'the argument is "this changed" (PR films).' },
			{
				id: 'mechanism',
				cue: 'parts arranged in a working motion — state machine cycling.'
			},
			{
				id: 'causal-loop',
				cue: 'variables influencing each other in a closed cycle.'
			}
		]
	},
	{
		name: 'comparison',
		cue: 'options against each other.',
		scenes: [
			{
				id: 'compare',
				cue: 'a head-to-head call as discrete table cells — options × criteria.',
				rut: true
			},
			{ id: 'landscape', cue: 'options on a 2-D trade-off plane.' },
			{ id: 'quantities', cue: 'the numbers are the argument.' },
			{ id: 'chart', cue: 'continuous data on numeric axes — a trend.' },
			{
				id: 'prior-art',
				cue: 'argument hinges on novelty — placed against 2–4 prior systems.'
			},
			{ id: 'venn', cue: 'argument is about what lives ONLY in the intersection.' },
			{
				id: 'probe',
				cue: 'vary ONE input and follow the consequence — sensitivity analysis.'
			}
		]
	},
	{
		name: 'categorization',
		cue: 'boundaries in the open.',
		scenes: [
			{
				id: 'tension',
				cue: 'a trade-off ledger — chosen / rejected / risk.',
				rut: true
			}
		]
	},
	{
		name: 'experience',
		cue: 'a human moving through.',
		scenes: [
			{
				id: 'journey-map',
				cue: 'how a PERSON moves through something — UX, onboarding, patient flow.'
			},
			{ id: 'closeup', cue: 'a specific code or text span needs to land at the line level.' }
		]
	},
	{
		name: 'narrative',
		cue: 'the rhetorical move.',
		scenes: [
			{
				id: 'frame',
				cue: "the film's opening commitment — title, tagline, footnote.",
				rut: true
			},
			{
				id: 'passage',
				cue: 'the SOURCE TEXT is the artifact — a poem, a quote, annotated.'
			},
			{ id: 'figure', cue: 'the IMAGE is the artifact — annotated by region.' },
			{ id: 'demonstrate', cue: 'only the moving image conveys it — a UI demo, a phenomenon.' },
			{
				id: 'big-idea',
				cue: 'one held sentence the viewer should leave with.'
			},
			{ id: 'recap', cue: 'a closing RULING — points the film proved.', rut: true },
			{ id: 'epigraph', cue: 'a cited authority opens the film.' },
			{ id: 'concession', cue: 'IN SCOPE / OUT OF SCOPE columns sharpen every claim.' },
			{
				id: 'objection',
				cue: 'CLAIM / OBJECTION / REFUTATION — steelman a challenge.'
			},
			{
				id: 'provocation',
				cue: "the right ending is 'we don't know yet' — a question-shaped hand-off."
			}
		]
	}
];

export const TOTAL_SCENES = CLUSTERS.reduce((s, c) => s + c.scenes.length, 0);
