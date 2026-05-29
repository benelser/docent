// /films/manifest.json — a public, machine-readable index of every film
// known to docent.studio. Prerendered at build time and served as static
// JSON; safe for external sites and aggregators to fetch.
import { FILMS } from '$lib/films';
import { json } from '@sveltejs/kit';

export const prerender = true;

const SITE = 'https://docent.studio';

export function GET() {
	const films = FILMS.map((f) => ({
		id: f.id,
		title: f.title,
		subject: f.subject,
		domain: f.domain,
		duration: f.duration,
		scenes: f.scenes,
		urls: {
			page: `${SITE}/v/${f.id}`,
			mp4: `${SITE}/films/${f.id}.mp4`,
			webm: `${SITE}/films/${f.id}.webm`,
			poster: `${SITE}/films/${f.id}-poster.jpg`
		}
	}));
	return json(
		{ version: 1, site: SITE, films },
		{ headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } }
	);
}
