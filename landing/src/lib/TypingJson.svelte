<script lang="ts">
	import { onMount } from 'svelte';

	let { source }: { source: string } = $props();

	let visible = $state(0);
	let started = $state(false);
	let container: HTMLDivElement;

	const run = (): void => {
		if (started) return;
		started = true;
		// Token-based reveal — roughly 8 chars per frame for a brisk
		// "typing" feel without making the user wait too long.
		const total = source.length;
		const start = performance.now();
		const duration = Math.min(2400, total * 6);
		const step = (now: number): void => {
			const t = Math.min(1, (now - start) / duration);
			// Ease-in-out
			const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
			visible = Math.round(total * eased);
			if (t < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	};

	onMount(() => {
		// If already on or above the fold (or in a headless context with no
		// viewport), start immediately — IO can miss when the user scrolls past
		// quickly or when threshold:0.4 is never met by a tall pane.
		const rect = container.getBoundingClientRect();
		const onScreen = rect.top < window.innerHeight * 1.2 && rect.bottom > -100;
		if (onScreen || window.innerHeight === 0) {
			run();
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						run();
						io.disconnect();
					}
				}
			},
			{ threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
		);
		io.observe(container);
		return () => io.disconnect();
	});

	let shown = $derived(source.slice(0, visible));
	let done = $derived(visible >= source.length);
</script>

<div bind:this={container} class="typing-shell">
	<pre class="typing-code"><code>{shown}<span class="caret" class:hide={done}>▍</span></code></pre>
</div>

<style>
	.typing-shell {
		display: contents;
	}

	.typing-code {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.6;
		color: var(--ink-mid);
		white-space: pre;
		tab-size: 2;
		overflow-x: auto;
		min-height: 100%;
	}

	.caret {
		display: inline-block;
		width: 0.6ch;
		color: var(--accent);
		font-weight: 700;
		animation: blink 1.05s steps(2) infinite;
	}

	.caret.hide {
		opacity: 0;
		animation: none;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
