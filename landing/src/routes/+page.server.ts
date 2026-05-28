// Read docs/the-format.md at build time, render to HTML, hand to the page.
// Markdown is the source of truth; the SvelteKit page is a presentation skin.
//
// Path resolution: the build always runs with cwd at landing/, so
// `../docs/the-format.md` is stable across dev (vite dev) and build
// (vite build → SvelteKit prerender). import.meta.url resolves to a
// post-build .svelte-kit/ path during prerender; don't rely on it.

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {marked} from 'marked';
import type {PageServerLoad} from './$types';

const manifestoPath = resolve(process.cwd(), '../docs/the-format.md');

export const prerender = true;

export const load: PageServerLoad = async () => {
	const raw = readFileSync(manifestoPath, 'utf-8');
	marked.setOptions({
		gfm: true,
		breaks: false
	});
	const html = await marked.parse(raw);
	return {
		manifestoHtml: html
	};
};
