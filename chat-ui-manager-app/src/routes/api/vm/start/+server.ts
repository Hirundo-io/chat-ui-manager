import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ComputeManagementClient } from '@azure/arm-compute';
import { AzureCliCredential, ManagedIdentityCredential } from '@azure/identity';
import { MachineStatus } from '$lib/types';

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP || '';
const vmName = process.env.AZURE_VM_NAME || '';

// Use AzureCliCredential for local development and ManagedIdentityCredential for Azure environment
const credential = process.env.IS_LOCAL_ENV
	? new AzureCliCredential()
	: new ManagedIdentityCredential();
const computeClient = new ComputeManagementClient(credential, subscriptionId);

export const POST: RequestHandler = async () => {
	try {
		await computeClient.virtualMachines.beginStartAndWait(resourceGroupName, vmName);
		return json({ status: MachineStatus.RUNNING });
	} catch (error) {
		console.error('Error starting VM:', error);
		return json({ status: MachineStatus.STOPPED, error: 'Could not start VM' }, { status: 500 });
	}
};
