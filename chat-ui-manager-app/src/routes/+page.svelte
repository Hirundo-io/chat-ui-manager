<script lang="ts">
	import { onMount } from 'svelte';
	import { MachineStatus } from '$lib/types';
	import { env } from '$env/dynamic/public';

	const chatUIUrl = env.PUBLIC_CHAT_UI_URL;
	let machineStatus: MachineStatus = $state(MachineStatus.UNKNOWN);
	let chatUIAvailable = $state(false);

	onMount(() => {
		const controller = new AbortController();
		checkMachineStatus(controller.signal);

		// Cleanup function to abort the fetch request when the component is destroyed
		return () => {
			controller.abort();
			console.log('Fetch aborted');
		};
	});

	async function checkMachineStatus(signal?: AbortSignal) {
		try {
			const res = await fetch('/api/vm/status', { signal });
			if (!res.ok) throw new Error('Failed to get status');
			const data = await res.json();
			machineStatus = data.status; // e.g. MachineStatus.RUNNING or MachineStatus.STOPPED etc.
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				console.error('Fetch aborted');
			} else {
				console.error(err);
				machineStatus = MachineStatus.UNKNOWN; // revert to 'unknown' if it fails
			}
		}
	}

	async function startMachine() {
		machineStatus = MachineStatus.STARTING;
		try {
			const res = await fetch('/api/vm/start', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to start machine');
			const data = await res.json();
			machineStatus = data.status; // e.g. MachineStatus.RUNNING
		} catch (err) {
			console.error(err);
			machineStatus = MachineStatus.STOPPED; // revert if it fails
		}
	}

	async function stopMachine() {
		machineStatus = MachineStatus.STOPPING;
		chatUIAvailable = false; // Reset availability of the Chat-UI page when stopping the VM
		try {
			const res = await fetch('/api/vm/stop', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to stop machine');
			const data = await res.json();
			machineStatus = data.status; // e.g. MachineStatus.STOPPED
		} catch (err) {
			console.error(err);
			machineStatus = MachineStatus.RUNNING; // revert if it fails
		}
	}

	// AbortController instance for Chat-UI availability check
	let chatUIController: AbortController | null = null;
	async function checkChatUIAvailability() {
		try {
			// If there's an ongoing request, abort it before starting a new one
			if (chatUIController) {
				chatUIController.abort();
			}
			chatUIController = new AbortController();

			if (!chatUIUrl) {
				chatUIAvailable = false;
				console.error('Chat-UI URL is not defined');
				return;
			}

			const res = await fetch(chatUIUrl, {
				method: 'GET',
				mode: 'no-cors',
				signal: chatUIController.signal
			});
			// If the response is opaque or has an OK status, assume Chat-UI is available
			chatUIAvailable = res.type === 'opaque' || res.ok;
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				console.error('Chat-UI availability check was aborted');
			} else {
				console.error(err);
				chatUIAvailable = false;
			}
		} finally {
			chatUIController = null;
		}
	}

	// Set up polling only when the machine is running and the Chat-UI is not available
	let availabilityInterval: ReturnType<typeof setInterval> | null = null;

	const clearPolling = () => {
		if (availabilityInterval) {
			clearInterval(availabilityInterval);
			availabilityInterval = null;
		}
	};

	$effect(() => {
		// When the VM is not running, stop any polling and reset chatUIAvailable
		if (machineStatus !== MachineStatus.RUNNING) {
			clearPolling();
			chatUIAvailable = false;
		} else {
			if (!chatUIAvailable && !availabilityInterval) {
				// Perform an immediate check before starting the interval
				checkChatUIAvailability();
				availabilityInterval = setInterval(checkChatUIAvailability, 5000); // Check every 5 seconds
			} else if (chatUIAvailable && availabilityInterval) {
				// If Chat-UI is available, stop polling
				clearPolling();
			}
		}
		return () => {
			// Cleanup function to clear the interval when the component is destroyed
			clearPolling();
			if (chatUIController) {
				chatUIController.abort();
				chatUIController = null;
			}
		};
	});

	let isButtonDisabled = $derived(
		machineStatus === MachineStatus.UNKNOWN ||
			machineStatus === MachineStatus.STARTING ||
			machineStatus === MachineStatus.STOPPING
	);
</script>

<div class="flex min-h-screen items-center justify-center">
	<div class="card w-full max-w-md border-2 p-6">
		<h1 class="mb-4 text-center text-2xl font-bold">Chat-UI Manager</h1>
		<p class="mb-2 text-center">
			Machine status: <strong>{machineStatus}</strong>
		</p>
		<!-- Start/Stop button -->
		<div class="flex justify-center">
			{#if machineStatus === MachineStatus.RUNNING}
				<button
					class="btn preset-filled-error-500 mt-4 px-4 py-2 disabled:cursor-not-allowed"
					onclick={stopMachine}
					disabled={isButtonDisabled}
				>
					Stop Machine
				</button>
			{:else}
				<button
					class="btn preset-filled-success-500 mt-4 px-4 py-2 disabled:cursor-not-allowed"
					onclick={startMachine}
					disabled={isButtonDisabled}
				>
					Start Machine
				</button>
			{/if}
		</div>
		<!-- Button to open the Chat UI -->
		<div class="flex justify-center">
			<button
				class="btn preset-filled-primary-500 mt-4 px-4 py-2 disabled:cursor-not-allowed"
				onclick={() => window.open(chatUIUrl, '_blank')}
				disabled={machineStatus !== MachineStatus.RUNNING || !chatUIAvailable}
			>
				Open Chat-UI
			</button>
		</div>
	</div>
</div>
