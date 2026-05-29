<script lang="ts">
	import { onMount } from 'svelte';

	let { data } = $props();
	const film = $derived(data.film);

	const SITE = 'https://docent.studio';
	const pageUrl = $derived(`${SITE}/v/${film.id}`);
	const posterUrl = $derived(`${SITE}/films/${film.id}-poster.jpg`);
	const videoUrl = $derived(`${SITE}/films/${film.id}.mp4`);
	const webmUrl = $derived(`${SITE}/films/${film.id}.webm`);
	const ogTitle = $derived(`${film.title} — ${film.subject}`);
	const ogDescription = $derived(
		`A docent film: ${film.title}, ${film.subject}. ${film.duration} · ${film.domain}.`
	);

	// Progressive enhancement: try to coax autoplay back on once we're mounted.
	// SSR already wrote autoplay/muted/playsinline, so this is just a nudge for
	// browsers that paused after hydration.
	let videoEl: HTMLVideoElement | null = $state(null);
	onMount(() => {
		if (videoEl) {
			videoEl.muted = true;
			const p = videoEl.play();
			if (p && typeof p.catch === 'function') p.catch(() => {});
		}
	});
</script>

<svelte:head>
	<title>{ogTitle} · docent</title>
	<meta name="description" content={ogDescription} />
	<link rel="canonical" href={pageUrl} />

	<!-- Open Graph -->
	<meta property="og:type" content="video.other" />
	<meta property="og:site_name" content="docent.studio" />
	<meta property="og:url" content={pageUrl} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:image" content={posterUrl} />
	<meta property="og:image:width" content="1920" />
	<meta property="og:image:height" content="1080" />
	<meta property="og:video" content={videoUrl} />
	<meta property="og:video:secure_url" content={videoUrl} />
	<meta property="og:video:type" content="video/mp4" />
	<meta property="og:video:width" content="1920" />
	<meta property="og:video:height" content="1080" />

	<!-- Twitter -->
	<meta name="twitter:card" content="player" />
	<meta name="twitter:site" content="@docent_studio" />
	<meta name="twitter:title" content={ogTitle} />
	<meta name="twitter:description" content={ogDescription} />
	<meta name="twitter:image" content={posterUrl} />
	<meta name="twitter:player" content={pageUrl} />
	<meta name="twitter:player:width" content="1920" />
	<meta name="twitter:player:height" content="1080" />
</svelte:head>

<main class="v-shell">
	<div class="v-stage">
		<!-- Pure SSR-rendered video. JS is just a nudge in onMount;
		     remove the script and this still plays. -->
		<video
			bind:this={videoEl}
			class="v-video"
			controls
			autoplay
			loop
			muted
			playsinline
			preload="metadata"
			poster="/films/{film.id}-poster.jpg"
		>
			<source src="/films/{film.id}.webm" type="video/webm" />
			<source src="/films/{film.id}.mp4" type="video/mp4" />
			<p>
				Your browser cannot play this video. <a href="/films/{film.id}.mp4">Download the mp4</a>.
			</p>
		</video>
	</div>

	<section class="v-meta">
		<p class="v-domain">{film.domain} · {film.duration}</p>
		<h1 class="v-title">
			{film.title} <em>— {film.subject}</em>
		</h1>

		<ol class="v-scenes" aria-label="Scene composition">
			{#each film.scenes as scene, i (i + '-' + scene)}
				<li class="v-scene">
					<span class="v-scene-num">{String(i + 1).padStart(2, '0')}</span>
					<span class="v-scene-name">{scene}</span>
				</li>
			{/each}
		</ol>

		<div class="v-actions">
			<a class="button button-primary" href="/">
				open on docent.studio <span class="arrow">→</span>
			</a>
			<a class="button button-ghost" href="/films/{film.id}.mp4" download>
				download mp4 <span class="arrow">↓</span>
			</a>
		</div>
	</section>

	<footer class="v-footer">
		<a href="/" class="v-mark">
			<span>docent</span>
			<span class="v-mark-v">v3.0</span>
		</a>
		<span class="v-footer-meta">
			JSON in. Narrated MP4 out. The format for LLM video.
		</span>
	</footer>
</main>

<style>
	.v-shell {
		max-width: 1200px;
		margin: 0 auto;
		padding: 6rem 1.5rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 3rem;
	}

	@media (max-width: 720px) {
		.v-shell {
			padding: 5rem 1rem 3rem;
			gap: 2rem;
		}
	}

	.v-stage {
		background: #000;
		border: 1px solid var(--bg-line);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px var(--bg-line);
	}

	.v-video {
		width: 100%;
		height: auto;
		aspect-ratio: 16 / 9;
		display: block;
		background: #000;
	}

	.v-meta {
		max-width: 900px;
	}

	.v-domain {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--accent);
		margin: 0 0 1rem;
	}

	.v-title {
		font-family: var(--font-display);
		font-size: clamp(2.25rem, 5vw, 3.75rem);
		line-height: 1.05;
		color: var(--ink-hi);
		letter-spacing: -0.025em;
		margin: 0 0 2.25rem;
		text-wrap: balance;
	}

	.v-title em {
		font-family: var(--font-display);
		font-style: italic;
		color: var(--ink-mid);
		font-weight: 400;
		font-size: 0.85em;
		letter-spacing: -0.015em;
	}

	.v-scenes {
		list-style: none;
		padding: 0;
		margin: 0 0 2.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.6rem;
	}

	.v-scene {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--bg-line);
		border-radius: 4px;
		background: var(--bg-paper);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--ink-mid);
	}

	.v-scene-num {
		color: var(--accent);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
	}

	.v-scene-name {
		color: var(--ink-hi);
	}

	.v-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	/* Buttons reuse global .button styles from app.css */
	.v-actions :global(.button) {
		text-decoration: none;
		border-bottom: 0;
	}

	.v-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1.5rem;
		padding-top: 2rem;
		border-top: 1px solid var(--bg-line);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--ink-low);
		flex-wrap: wrap;
	}

	.v-mark {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
		color: var(--ink-hi);
		border: 0;
	}

	.v-mark-v {
		font-family: var(--font-mono);
		font-style: normal;
		font-size: 0.65rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--accent);
		padding: 0.15rem 0.4rem;
		border: 1px solid var(--accent-deep);
		border-radius: 4px;
	}

	.v-footer-meta {
		color: var(--ink-mid);
		max-width: 36ch;
		text-align: right;
	}

	@media (max-width: 720px) {
		.v-footer-meta {
			text-align: left;
		}
	}
</style>
