<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<title>docent — the format for LLM-authored video</title>
	<meta
		name="description"
		content="Docent is a file format for video. JSON in, narrated MP4 out. A grammar of 29 cognitive moves makes any film composable. Same engine renders a PR review, a brand quarterly, a documentary, a sci-fi short. A2A is for agents. MCP is for tools. Docent is for film."
	/>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="theme-color" content="#0c0a08" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="docent — the format for LLM-authored video" />
	<meta
		property="og:description"
		content="JSON in. Narrated MP4 out. The format for LLM video, the way A2A is for agents and MCP is for tools."
	/>
	<meta property="og:site_name" content="docent.studio" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{@render children()}
