<script lang="ts">
	import { onMount } from 'svelte';

	let {
		open,
		onClose,
		children
	}: {
		open: boolean;
		onClose: () => void;
		children?: () => unknown;
	} = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			document.body.style.overflow = 'hidden';
		} else if (!open && dialog.open) {
			dialog.close();
			document.body.style.overflow = '';
		}
	});

	onMount(() => () => {
		document.body.style.overflow = '';
	});

	const onBackdropClick = (e: MouseEvent): void => {
		// Click on the dialog itself (the backdrop), not its inner content,
		// closes the lightbox — the standard "click outside to dismiss" UX.
		if (e.target === dialog) onClose();
	};

	const onKey = (e: KeyboardEvent): void => {
		if (e.key === 'Escape') onClose();
	};
</script>

<dialog
	bind:this={dialog}
	class="lightbox"
	onclick={onBackdropClick}
	onkeydown={onKey}
	onclose={onClose}
	aria-modal="true"
>
	<button class="lightbox-close" onclick={onClose} aria-label="Close">×</button>
	<div class="lightbox-content">
		{#if children}{@render children()}{/if}
	</div>
</dialog>

<style>
	.lightbox {
		max-width: min(1200px, 92vw);
		max-height: 90vh;
		width: min(1200px, 92vw);
		padding: 0;
		background: var(--bg-paper);
		border: 1px solid var(--bg-line);
		border-radius: 12px;
		color: var(--ink-hi);
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px var(--bg-line);
		overflow: hidden;
	}

	.lightbox::backdrop {
		background: rgba(8, 6, 4, 0.82);
		backdrop-filter: blur(8px);
	}

	.lightbox[open] {
		animation: lightbox-in 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.lightbox-close {
		position: absolute;
		top: 0.65rem;
		right: 0.85rem;
		z-index: 2;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 1px solid var(--bg-line);
		background: var(--bg-rise);
		color: var(--ink-mid);
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
	}

	.lightbox-close:hover {
		color: var(--ink-hi);
		border-color: var(--accent);
	}

	.lightbox-content {
		max-height: 90vh;
		overflow-y: auto;
	}

	@keyframes lightbox-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
