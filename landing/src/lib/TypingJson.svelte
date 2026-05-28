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
		// Animate immediately on mount. The pane lives below the fold, so the
		// animation usually completes before the viewer scrolls into view —
		// they see static text, which is fine. The alternative (gating on IO)
		// was leaving the pane empty when the observer didn't fire reliably,
		// e.g. through a display:contents wrapper that has no layout box.
		// Static-text > blank-pane every time.
		run();
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
