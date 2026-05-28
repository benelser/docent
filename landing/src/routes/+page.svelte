<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="shell">
	<span class="kicker">docent.studio</span>
	<div class="manifesto">
		{@html data.manifestoHtml}
	</div>
	<footer class="footer">
		<span>docent.studio</span>
		<span><a href="https://github.com/benelser/docent">github</a></span>
		<span>MIT</span>
	</footer>
</main>

<style>
	.manifesto :global(h1) {
		margin-top: 0;
	}
</style>
