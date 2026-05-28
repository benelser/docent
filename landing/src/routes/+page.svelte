<script lang="ts">
	import { onMount } from 'svelte';
	import { CLUSTERS, TOTAL_SCENES } from '$lib/data';
	import { FILMS } from '$lib/films';
	import TypingJson from '$lib/TypingJson.svelte';
	import Counter from '$lib/Counter.svelte';
	import CascadeStages from '$lib/CascadeStages.svelte';

	onMount(() => {
		// Lazy autoplay films when they scroll into view, pause when they leave —
		// keeps the tab quiet + bandwidth low while still feeling alive.
		const filmObs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					const v = e.target as HTMLVideoElement;
					if (e.isIntersecting) {
						v.play().catch(() => {});
					} else {
						v.pause();
					}
				}
			},
			{ threshold: 0.25 }
		);
		document.querySelectorAll('video.lazy').forEach((v) => filmObs.observe(v));
	});

	const demoSpec = `{
  "meta": {
    "id": "openclaw-ar",
    "title": "OpenClaw",
    "subject": "One local daemon, twenty-two channels",
    "fps": 30,
    "voice": "af_heart"
  },
  "scenes": [
    { "type": "frame", "title": "OpenClaw" },
    { "type": "prior-art", "systems": [...], "dimensions": [...] },
    { "type": "structure", "nodes": [...], "edges": [...] },
    { "type": "walkthrough", "actors": [...], "steps": [...] },
    { "type": "tension",
      "chosen":   ["..."],
      "rejected": ["..."],
      "risks":    ["..."]
    },
    { "type": "quantities", "figures": [...] },
    { "type": "recap", "points": ["..."] }
  ]
}`;

	// Every canonical scene now has a still — extracted from a real render.
	const stillExists = (_id: string): boolean => true;
</script>

<section class="hero">
	<div class="hero-film">
		<video autoplay muted loop playsinline preload="auto" poster="/films/hero-poster.jpg">
			<source src="/films/hero.webm" type="video/webm" />
			<source src="/films/hero.mp4" type="video/mp4" />
		</video>
	</div>
	<div class="shell hero-content">
		<div class="hero-mark">docent.studio</div>
		<h1 class="hero-headline">
			Markdown<br />for <span class="accent">video</span>.<br />Built for
			<span class="accent">LLMs</span>.
		</h1>
		<p class="hero-sub">
			A file format for <strong>video</strong>. You write JSON. An engine renders it. A grammar of
			cognitive moves makes any film composable. A contract keeps it from being slop.
		</p>
		<div class="hero-cta">
			<a class="button button-primary" href="#install">
				install <span class="arrow">→</span>
			</a>
			<a class="button button-ghost" href="#grammar">
				see the grammar <span class="arrow">↓</span>
			</a>
		</div>
	</div>
</section>

<section class="section">
	<div class="shell">
		<div class="reveal" style="max-width: 920px;">
			<span class="section-kicker">the format</span>
			<h2 class="section-title">
				One JSON file. <em>Any film you can think of.</em>
			</h2>
			<p class="section-lead">
				Most video tools start with the canvas — a timeline, layers, keyframes. Docent starts with
				<strong>the moves any piece of thought can make</strong>. You declare them. The engine
				renders. The same grammar handles a code review, a brand quarterly, a poetry close
				reading, a sci-fi short, a quarterly earnings walk, a documentary.
			</p>
			<p class="section-lead">
				The format is the surface an LLM can author against without the output drifting into slop.
				Every scene declares its schema. Every scene declares its depth rules. A film that doesn't
				say anything doesn't ship.
			</p>
		</div>
	</div>
</section>

<section class="section" id="grammar">
	<div class="shell">
		<div class="catalog-intro reveal">
			<span class="section-kicker">the grammar</span>
			<h2 class="section-title">
				<span class="counter-num"><Counter value={TOTAL_SCENES} /></span> moves.
				<em>The vocabulary of video.</em>
			</h2>
			<p class="section-lead">
				Connection. Time. Flow. Comparison. Categorization. Experience. Narrative. Seven clusters
				of cognition — enough to compose any film. Adding a thirtieth move is a major version
				bump. That restraint <em>is</em> the format.
			</p>
		</div>

		{#each CLUSTERS as cluster (cluster.name)}
			<div class="cluster reveal">
				<div class="cluster-head">
					<span class="cluster-name">{cluster.name}</span>
					<span class="cluster-count">{cluster.scenes.length} moves</span>
					<span class="cluster-cue">{cluster.cue}</span>
				</div>
				<div class="tile-grid">
					{#each cluster.scenes as scene (scene.id)}
						<a
							class="tile"
							href="https://github.com/benelser/docent/tree/main/packages/core/src/scenes/{scene.id}"
							title={scene.cue}
						>
							{#if stillExists(scene.id)}
								<img
									class="tile-still"
									src="/stills/{scene.id}.jpg"
									alt="{scene.id} scene example"
									loading="lazy"
									decoding="async"
								/>
							{:else}
								<div class="tile-placeholder">{scene.id}</div>
							{/if}
							<div class="tile-label">
								<span class="tile-name">{scene.id}</span>
								{#if scene.rut}
									<span class="tile-rut">default rut</span>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</section>

<section class="section gallery" id="gallery">
	<div class="shell">
		<div class="reveal" style="max-width: 920px;">
			<span class="section-kicker">four films</span>
			<h2 class="section-title">
				Same engine. <em>Four worlds.</em>
			</h2>
			<p class="section-lead">
				A software architecture review. A security essay walked through. A research paper rendered.
				Docent reviewing itself. Different subjects, different scene compositions, one cascade.
			</p>
		</div>

		<div class="film-grid">
			{#each FILMS as film, i (film.id)}
				<a
					class="film-card reveal"
					href="https://github.com/benelser/docent/releases/download/v3.0.0-rc.0/{film.id}.mp4"
					style="animation-delay: {i * 100}ms;"
				>
					<div class="film-card-video">
						<video
							class="lazy"
							muted
							loop
							playsinline
							preload="metadata"
							poster="/films/{film.id}-poster.jpg"
						>
							<source src="/films/{film.id}.webm" type="video/webm" />
							<source src="/films/{film.id}.mp4" type="video/mp4" />
						</video>
						<span class="film-card-duration">{film.duration}</span>
					</div>
					<div class="film-card-body">
						<h3 class="film-card-title">
							{film.title}
							<span class="film-card-subject">— {film.subject}</span>
						</h3>
						<p class="film-card-domain">{film.domain}</p>
						<div class="film-card-scenes">
							{#each film.scenes as s, j (j + s)}
								<span class="scene-chip">{s}</span>{#if j < film.scenes.length - 1}<span
										class="scene-sep">·</span
									>{/if}
							{/each}
						</div>
					</div>
				</a>
			{/each}
		</div>
	</div>
</section>

<section class="section demo">
	<div class="shell">
		<div class="reveal" style="max-width: 920px;">
			<span class="section-kicker">the cascade</span>
			<h2 class="section-title">JSON in. <em>Narrated MP4 out.</em></h2>
			<p class="section-lead">
				The spec is the source. The render is the artifact. Same path whether the film is a PR
				review, a documentary, or a brand opener.
			</p>
		</div>

		<div class="demo-stages reveal">
			<CascadeStages />
		</div>

		<div class="demo-pair reveal">
			<div class="demo-pane">
				<div class="demo-pane-header">
					<span class="dot"></span>films/openclaw-ar.json
				</div>
				<div class="demo-pane-body">
					<TypingJson source={demoSpec} />
				</div>
			</div>
			<div class="demo-pane video">
				<div class="demo-pane-header">
					<span class="dot"></span>out/openclaw-ar.mp4
				</div>
				<div class="demo-pane-body">
					<video
						class="lazy"
						muted
						loop
						playsinline
						preload="metadata"
						poster="/films/openclaw-ar-poster.jpg"
					>
						<source src="/films/openclaw-ar.webm" type="video/webm" />
						<source src="/films/openclaw-ar.mp4" type="video/mp4" />
					</video>
				</div>
			</div>
		</div>
	</div>
</section>

<section class="section" id="install">
	<div class="shell">
		<div class="install reveal">
			<span class="section-kicker">try it</span>
			<h2 class="section-title">Write your first film. <em>In an hour.</em></h2>
			<p class="section-lead">
				Three packages: the framework, the default implementation, the binary. Write a spec at
				<code>films/&lt;id&gt;.json</code>. Run <code>docent build &lt;id&gt;</code>. Watch.
				Ship.
			</p>
			<div class="install-cmd">
				<span class="prompt">$</span> bun add @docent/cli @docent/core @docent/kit
			</div>
			<div class="install-row">
				<a class="button button-primary" href="https://github.com/benelser/docent#quick-start">
					quick start <span class="arrow">→</span>
				</a>
				<a class="button button-ghost" href="https://github.com/benelser/docent">
					github <span class="arrow">↗</span>
				</a>
			</div>
		</div>
	</div>
</section>

<footer class="footer">
	<div class="shell">
		<div class="footer-grid">
			<div>
				<span class="footer-mark">docent</span>
				<p class="footer-tag">
					The format for LLM-authored video. A2A for agents, MCP for tools, docent for film.
					Open source under MIT.
				</p>
			</div>
			<div>
				<div class="footer-col-head">packages</div>
				<ul>
					<li><a href="https://www.npmjs.com/package/@docent/kit">@docent/kit</a></li>
					<li><a href="https://www.npmjs.com/package/@docent/core">@docent/core</a></li>
					<li><a href="https://www.npmjs.com/package/@docent/cli">@docent/cli</a></li>
				</ul>
			</div>
			<div>
				<div class="footer-col-head">extend</div>
				<ul>
					<li><a href="https://github.com/benelser/docent/tree/main/tests">reference packs</a></li>
					<li><a href="https://github.com/benelser/docent/blob/main/CONTRIBUTING.md">contribute</a></li>
					<li><a href="https://github.com/benelser/docent/blob/main/packages/kit/src/protocols.ts">protocols</a></li>
				</ul>
			</div>
			<div>
				<div class="footer-col-head">roadmap</div>
				<ul>
					<li><a href="https://github.com/benelser/docent/blob/main/docs/design/v3-roadmap.md">v3 plan</a></li>
					<li><a href="https://github.com/benelser/docent/blob/main/docs/design/v3-stabilization.COMPLETE.md">v3 stabilization</a></li>
					<li><a href="https://github.com/benelser/docent/releases">releases</a></li>
				</ul>
			</div>
		</div>
		<div class="footer-bottom">
			<span>© docent · MIT</span>
			<span>docent.studio</span>
		</div>
	</div>
</footer>
