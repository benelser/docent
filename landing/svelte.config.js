import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Static adapter — outputs to landing/build, which Firebase Hosting serves.
		// The site is purely static (no SSR); SvelteKit prerenders every route.
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: undefined,
			precompress: false,
			strict: true
		}),
		prerender: {
			// The shared Nav uses on-page hash links (#grammar, #gallery, #install)
			// that only resolve on / — they're no-ops on /v/<id>. Don't fail the
			// build over those; the landing page is the authoritative target for
			// those anchors and `cleanUrls` routes them there naturally.
			handleMissingId: 'ignore'
		}
	}
};

export default config;
