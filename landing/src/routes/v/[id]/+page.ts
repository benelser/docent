// Prerender every /v/<id>/index.html at build time — one per FILM.
// Any film added to FILMS automatically gets a shareable URL on next build.
import { error } from '@sveltejs/kit';
import { FILMS, type Film } from '$lib/films';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => {
	return FILMS.map((f) => ({ id: f.id }));
};

export const load: PageLoad = ({ params }) => {
	const film: Film | undefined = FILMS.find((f) => f.id === params.id);
	if (!film) {
		throw error(404, `No film with id "${params.id}"`);
	}
	return { film };
};
