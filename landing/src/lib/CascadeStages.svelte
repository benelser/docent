<script lang="ts">
	import { onMount } from 'svelte';

	const stages = [
		{ name: 'validate', desc: 'schema + per-scene' },
		{ name: 'preprocess', desc: 'directives + modifiers' },
		{ name: 'resolve style', desc: 'preset extends' },
		{ name: 'tts', desc: 'kokoro / openai / elevenlabs' },
		{ name: 'render', desc: 'remotion + audio overlay' }
	];

	let done = $state<boolean[]>(stages.map(() => false));
	let container: HTMLDivElement;

	let triggered = false;
	const run = (): void => {
		if (triggered) return;
		triggered = true;
		stages.forEach((_, i) => {
			setTimeout(() => {
				done[i] = true;
			}, 400 + i * 360);
		});
	};

	onMount(() => {
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
</script>

<div bind:this={container} class="cascade-stages">
	{#each stages as stage, i (stage.name)}
		<div class="cascade-stage" class:done={done[i]}>
			<span class="cascade-stage-mark">
				{#if done[i]}
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path d="M3.5 8.2 L6.8 11.5 L12.5 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				{:else}
					<span class="cascade-stage-spinner" aria-hidden="true"></span>
				{/if}
			</span>
			<span class="cascade-stage-text">
				<span class="cascade-stage-name">{stage.name}</span>
				<span class="cascade-stage-desc">{stage.desc}</span>
			</span>
		</div>
		{#if i < stages.length - 1}
			<div class="cascade-stage-arrow" class:done={done[i]}>→</div>
		{/if}
	{/each}
</div>

<style>
	.cascade-stages {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: 0.65rem;
		justify-content: center;
		max-width: 920px;
		margin: 0 auto 0;
		padding: 0;
	}

	.cascade-stage {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.7rem 1rem;
		background: var(--bg-paper);
		border: 1px solid var(--bg-line);
		border-radius: 8px;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--ink-low);
		transition: border-color 0.5s ease, background 0.5s ease, color 0.5s ease,
			box-shadow 0.5s ease;
	}

	.cascade-stage.done {
		border-color: var(--accent);
		color: var(--ink-hi);
		background: var(--bg-rise);
		box-shadow: 0 0 18px var(--accent-glow);
	}

	.cascade-stage-mark {
		width: 18px;
		height: 18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--accent);
	}

	.cascade-stage-mark svg {
		width: 18px;
		height: 18px;
	}

	.cascade-stage-spinner {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1.5px solid var(--bg-line-hi);
		border-top-color: var(--ink-low);
		animation: spin 0.85s linear infinite;
		display: inline-block;
	}

	.cascade-stage-text {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		line-height: 1.1;
	}

	.cascade-stage-name {
		font-weight: 500;
		letter-spacing: 0.02em;
		font-size: 0.85rem;
	}

	.cascade-stage-desc {
		font-size: 0.68rem;
		color: var(--ink-low);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.cascade-stage.done .cascade-stage-name {
		color: var(--ink-hi);
	}

	.cascade-stage-arrow {
		display: flex;
		align-items: center;
		font-family: var(--font-mono);
		color: var(--ink-faint);
		font-size: 1.1rem;
		transition: color 0.5s ease;
	}

	.cascade-stage-arrow.done {
		color: var(--accent);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 920px) {
		.cascade-stages {
			gap: 0.5rem;
		}
		.cascade-stage-arrow {
			display: none;
		}
		.cascade-stage {
			flex: 1 1 calc(50% - 0.25rem);
			min-width: 0;
		}
	}
</style>
