import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ComputeManagementClient } from '@azure/arm-compute';
import { AzureCliCredential } from '@azure/identity';
import { MachineStatus } from '$lib/types';

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP || '';
const vmName = process.env.AZURE_VM_NAME || '';
const credential = new AzureCliCredential();
const computeClient = new ComputeManagementClient(credential, subscriptionId);

const mapPowerStateToMachineStatus = (powerState?: string): MachineStatus => {
	switch (powerState) {
		case 'PowerState/running':
			return MachineStatus.RUNNING;
		case 'PowerState/deallocated':
			return MachineStatus.STOPPED;
		case 'PowerState/deallocating':
			return MachineStatus.STOPPING;
		case 'PowerState/starting':
			return MachineStatus.STARTING;
		default:
			return MachineStatus.UNKNOWN;
	}
};

export const GET: RequestHandler = async () => {
	try {
		// Retrieve the instance view of the VM to check its status.
		const instanceView = await computeClient.virtualMachines.instanceView(
			resourceGroupName,
			vmName
		);
		// Extract the power state from the instance view statuses.
		const powerState = instanceView.statuses?.find((status) =>
			status.code?.startsWith('PowerState/')
		)?.code;

		const status = mapPowerStateToMachineStatus(powerState);

		return json({ status });
	} catch (error) {
		console.error('Error fetching VM status:', error);
		return json(
			{ status: MachineStatus.UNKNOWN, error: 'Could not fetch status' },
			{ status: 500 }
		);
	}
};
