<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>docent — markdown for video, built for LLMs</title>
	<meta name="description" content="Docent is a file format for structured explainer video. JSON in, narrated MP4 out. A closed grammar of 29 cognitive moves. A depth contract that catches sloppy authoring before the render burns minutes." />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="theme-color" content="#0a0c10" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="docent — markdown for video, built for LLMs" />
	<meta property="og:description" content="A file format for structured explainer video. JSON in, narrated MP4 out." />
	<meta property="og:site_name" content="docent.studio" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{@render children()}
