<script lang="ts">
	import { onMount } from 'svelte';

	let { value, duration = 1400 }: { value: number; duration?: number } = $props();
	let display = $state(0);
	let started = $state(false);
	let container: HTMLSpanElement;

	onMount(() => {
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting && !started) {
						started = true;
						const start = performance.now();
						const step = (now: number) => {
							const t = Math.min(1, (now - start) / duration);
							// Ease-out-cubic
							const eased = 1 - Math.pow(1 - t, 3);
							display = Math.round(value * eased);
							if (t < 1) requestAnimationFrame(step);
						};
						requestAnimationFrame(step);
						io.disconnect();
					}
				}
			},
			{ threshold: 0.5 }
		);
		io.observe(container);
		return () => io.disconnect();
	});
</script>

<span bind:this={container}>{display}</span>
