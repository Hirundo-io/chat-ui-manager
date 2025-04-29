<script lang="ts">
	import { onMount } from 'svelte';
	import { MachineStatus } from '$lib/types';
	import { env } from '$env/dynamic/public';

	const chatUIUrl = env.PUBLIC_CHAT_UI_URL;
	const chatUIDelayMs = Number(env.PUBLIC_CHAT_UI_DELAY_SEC) * 1000 || 30_000; // Default to 30 seconds if not set
	const pollStatusIntervalMs = 5000; // 5 seconds
	const maxPollAttempts = 36; // 5 * 36 = 3 minutes

	let machineStatus: MachineStatus = $state(MachineStatus.UNKNOWN);
	let chatUIAvailable = $state(false);

	// Controller to cancel polling if needed
	let pollController: AbortController;

	onMount(() => {
		const controller = new AbortController();
		checkMachineStatus(controller.signal);

		// Cleanup function to abort the fetch request when the component is destroyed
		return () => {
			controller.abort();
		};
	});

	// Poll for the VM's status until it is RUNNING/STOPPED, reached max attempts, or if aborted via signal.
	async function pollStatusUntilFinal(signal?: AbortSignal): Promise<MachineStatus> {
		return new Promise((resolve, reject) => {
			let attempts = 0;
			const timer = setInterval(async () => {
				// Abort if signaled
				if (signal?.aborted) {
					clearInterval(timer);
					return reject(new Error('Polling aborted'));
				}
				attempts++;
				try {
					await checkMachineStatus(signal);
					if (machineStatus === MachineStatus.RUNNING || machineStatus === MachineStatus.STOPPED) {
						clearInterval(timer);
						return resolve(machineStatus); // Resolve with the current machineStatus
					}
					if (attempts >= maxPollAttempts) {
						clearInterval(timer);
						return reject(new Error('Polling timed out'));
					}
				} catch (err) {
					clearInterval(timer);
					return reject(err);
				}
			}, pollStatusIntervalMs);
			signal?.addEventListener('abort', () => {
				clearInterval(timer);
				reject(new Error('Polling aborted'));
			});
		});
	}

	async function checkMachineStatus(signal?: AbortSignal) {
		try {
			const res = await fetch('/api/vm/status', { signal });
			if (!res.ok) throw new Error('Failed to get status');
			const { status, startedAt } = await res.json();
			machineStatus = status; // E.g. MachineStatus.RUNNING or MachineStatus.STOPPED etc.

			if (startedAt) {
				const startTime = new Date(startedAt).getTime();
				const elapsedTime = Date.now() - startTime;
				// If the machine is running longer than the delay, assume chat UI is available
				if (elapsedTime >= chatUIDelayMs) {
					chatUIAvailable = true;
				} else {
					const remainingTime = chatUIDelayMs - elapsedTime;
					setChatUIDelay(remainingTime);
				}
			}
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				console.error('Fetch aborted');
			} else {
				console.error(err);
				machineStatus = MachineStatus.UNKNOWN; // Revert if it fails
			}
		}
	}

	async function startMachine() {
		machineStatus = MachineStatus.STARTING;
		try {
			pollController = new AbortController();
			const res = await fetch('/api/vm/start', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to start machine');
			const { status } = await res.json();
			machineStatus = status; // E.g. MachineStatus.STARTING

			const final = await pollStatusUntilFinal(pollController.signal);
			if (final === MachineStatus.RUNNING) {
				setChatUIDelay(chatUIDelayMs); // Once the machine is running, set the delay
			}
		} catch (err) {
			console.error(err);
			pollController?.abort();
			machineStatus = MachineStatus.STOPPED;
		}
	}

	async function stopMachine() {
		machineStatus = MachineStatus.STOPPING;
		chatUIAvailable = false; // Reset availability of the Chat-UI page when stopping the VM
		try {
			pollController = new AbortController();
			const res = await fetch('/api/vm/stop', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to stop machine');
			const { status } = await res.json();
			machineStatus = status; // E.g. MachineStatus.STOPPING
			await pollStatusUntilFinal(pollController.signal); // Wait for the machine to stop
		} catch (err) {
			console.error(err);
			pollController?.abort();
			machineStatus = MachineStatus.RUNNING;
			chatUIAvailable = true; // Reset availability of the Chat-UI page
		}
	}

	const setChatUIDelay = (delay: number) => {
		chatUIAvailable = false; // Reset availability of the Chat-UI page
		setTimeout(() => {
			chatUIAvailable = true;
		}, delay);
	};

	const openChatUI = () => {
		if (chatUIUrl) {
			window.open(chatUIUrl, '_blank');
		} else {
			console.error('Chat-UI URL is not defined');
		}
	};

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
				onclick={openChatUI}
				disabled={machineStatus !== MachineStatus.RUNNING || !chatUIAvailable}
			>
				Open Chat-UI
			</button>
		</div>
	</div>
</div>
