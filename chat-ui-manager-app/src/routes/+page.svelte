<script lang="ts">
	import { onMount } from 'svelte';
	import { MachineStatus } from '$lib/types';
	import { env } from '$env/dynamic/public';

	const chatUIUrl = env.PUBLIC_CHAT_UI_URL;
	let machineStatus: MachineStatus = $state(MachineStatus.UNKNOWN);
	let chatUIAvailable = $state(false);

	onMount(async () => {
		await checkMachineStatus();
	});

	async function checkMachineStatus() {
		try {
			const res = await fetch('/api/vm/status');
			if (!res.ok) throw new Error('Failed to get status');
			const data = await res.json();
			machineStatus = data.status; // e.g. MachineStatus.RUNNING or MachineStatus.STOPPED etc.
		} catch (err) {
			console.error(err);
			machineStatus = MachineStatus.UNKNOWN; // revert to 'unknown' if it fails
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

	// Check if Chat-UI page is available
	async function checkChatUIAvailability() {
		try {
			if (!chatUIUrl) {
				chatUIAvailable = false;
				console.error('Chat-UI URL is not defined');
				return;
			}
			const res = await fetch(chatUIUrl, { method: 'GET', mode: 'no-cors' });
			// If the response is opaque or has an OK status, assume Chat-UI is available
			chatUIAvailable = res.type === 'opaque' || res.ok;
		} catch (error) {
			console.error(error);
			chatUIAvailable = false;
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
		};
	});
</script>

<div class="flex min-h-screen items-center justify-center">
	<div class="card w-full max-w-md border-2 p-6">
		<h1 class="mb-4 text-center text-2xl font-bold">Chat-UI Manager</h1>
		<p class="mb-2 text-center">
			Machine status: <strong>{machineStatus}</strong>
		</p>
		<!-- Start/Stop button -->
		<div class="flex justify-center">
			<button
				class="btn mt-4 px-4 py-2 disabled:cursor-not-allowed {machineStatus ===
				MachineStatus.RUNNING
					? 'preset-filled-error-500'
					: 'preset-filled-success-500'}"
				onclick={machineStatus === MachineStatus.RUNNING ? stopMachine : startMachine}
				disabled={machineStatus === MachineStatus.UNKNOWN ||
					machineStatus === MachineStatus.STARTING ||
					machineStatus === MachineStatus.STOPPING}
			>
				{machineStatus === MachineStatus.RUNNING ? 'Stop Machine' : 'Start Machine'}
			</button>
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
