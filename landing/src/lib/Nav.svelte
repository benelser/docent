<script lang="ts">
	import { onMount } from 'svelte';

	let scrolled = $state(false);

	onMount(() => {
		const onScroll = () => {
			scrolled = window.scrollY > 120;
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<nav class="nav" class:scrolled>
	<div class="nav-shell">
		<a class="nav-mark" href="/">
			<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
				<rect x="6" y="6" width="52" height="52" rx="10" fill="#0c0a08" stroke="#e6a949" stroke-width="2.5"/>
				<rect x="11" y="13" width="3.5" height="5" rx="1" fill="#e6a949"/>
				<rect x="11" y="22" width="3.5" height="5" rx="1" fill="#e6a949"/>
				<rect x="11" y="31" width="3.5" height="5" rx="1" fill="#e6a949"/>
				<rect x="11" y="40" width="3.5" height="5" rx="1" fill="#e6a949"/>
				<rect x="11" y="49" width="3.5" height="5" rx="1" fill="#e6a949"/>
				<text x="35" y="47" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-weight="400" font-size="40" fill="#f8f3e9" text-anchor="middle">d</text>
			</svg>
			<span class="nav-mark-text">docent</span>
			<span class="nav-version">v3.0</span>
		</a>
		<div class="nav-links">
			<a href="/#grammar">grammar</a>
			<a href="/#gallery">films</a>
			<a href="/#install">install</a>
			<a href="https://github.com/benelser/docent" class="nav-gh">
				<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
					<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
				</svg>
				<span>github</span>
			</a>
		</div>
	</div>
</nav>

<style>
	.nav {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 50;
		padding: 1.25rem 0;
		transition: backdrop-filter 0.3s ease, background 0.3s ease, padding 0.3s ease,
			border-color 0.3s ease;
		border-bottom: 1px solid transparent;
	}

	.nav.scrolled {
		padding: 0.7rem 0;
		background: rgba(12, 10, 8, 0.78);
		backdrop-filter: blur(18px) saturate(140%);
		-webkit-backdrop-filter: blur(18px) saturate(140%);
		border-bottom-color: var(--bg-line);
	}

	.nav-shell {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
	}

	.nav-mark {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		color: var(--ink-hi);
		border: 0;
		font-family: var(--font-display);
		font-style: italic;
		font-size: 1.4rem;
	}

	.nav-mark svg {
		width: 30px;
		height: 30px;
	}

	.nav-mark-text {
		font-style: italic;
	}

	.nav-version {
		font-family: var(--font-mono);
		font-style: normal;
		font-size: 0.65rem;
		color: var(--accent);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		margin-left: 0.25rem;
		padding: 0.15rem 0.4rem;
		border: 1px solid var(--accent-deep);
		border-radius: 4px;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
	}

	.nav-links a {
		color: var(--ink-mid);
		border: 0;
		transition: color 0.2s ease;
	}

	.nav-links a:hover {
		color: var(--accent);
	}

	.nav-gh {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	@media (max-width: 720px) {
		.nav-links a:not(.nav-gh) {
			display: none;
		}
		.nav-shell {
			padding: 0 1rem;
		}
	}
</style>
