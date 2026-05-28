// The four hero films — what the engine actually produces.
// Same engine, same grammar, different subjects, different scenes.

export type Film = {
	id: string;
	title: string;
	subject: string;
	scenes: string[];
	duration: string;
	domain: string;
};

export const FILMS: Film[] = [
	{
		id: 'docent-self',
		title: 'Docent',
		subject: 'reviewing its own architecture',
		scenes: ['frame', 'prior-art', 'structure', 'progression', 'compare', 'tension', 'quantities', 'recap'],
		duration: '10:51',
		domain: 'software · architecture review'
	},
	{
		id: 'openclaw-ar',
		title: 'OpenClaw',
		subject: 'one local daemon, twenty-two channels',
		scenes: ['frame', 'prior-art', 'structure', 'walkthrough', 'structure', 'tension', 'quantities', 'recap'],
		duration: '12:21',
		domain: 'software · architecture review'
	},
	{
		id: 'lethal-trifecta-blog',
		title: 'The Lethal Trifecta',
		subject: "Simon Willison's essay on agent security",
		scenes: ['frame', 'structure', 'passage', 'walkthrough', 'quantities', 'compare', 'tension', 'big-idea', 'recap'],
		duration: '12:19',
		domain: 'explainer · essay close-reading'
	},
	{
		id: 'arxiv-2512-14806',
		title: 'Let the Barbarians In',
		subject: 'a recent arXiv paper, fetched as PDF',
		scenes: ['frame', 'compare', 'structure', 'quantities', 'tension', 'probe', 'big-idea', 'recap'],
		duration: '10:49',
		domain: 'research · paper walkthrough'
	}
];
