<script lang="ts">
	import { onMount } from 'svelte';

	let { value, duration = 1400 }: { value: number; duration?: number } = $props();
	let display = $state(0);
	let container: HTMLSpanElement;

	const animate = (): void => {
		const start = performance.now();
		const step = (now: number): void => {
			const t = Math.min(1, (now - start) / duration);
			// Ease-out-cubic
			const eased = 1 - Math.pow(1 - t, 3);
			display = Math.round(value * eased);
			if (t < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	};

	onMount(() => {
		// If the counter is already on or above the fold, animate immediately.
		// Otherwise wait for IntersectionObserver. This makes the counter
		// reliable even when full-page screenshot tools don't trigger IO
		// callbacks the way scroll does.
		const rect = container.getBoundingClientRect();
		const visibleEnough =
			rect.top < window.innerHeight * 1.2 && rect.bottom > -100;
		if (visibleEnough || window.innerHeight === 0) {
			animate();
			return;
		}
		let triggered = false;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting && !triggered) {
						triggered = true;
						animate();
						io.disconnect();
					}
				}
			},
			{ threshold: 0.4 }
		);
		io.observe(container);
		return () => io.disconnect();
	});
</script>

<span bind:this={container}>{display}</span>
