import * as p from '@clack/prompts';
import pc from 'picocolors';

export interface WizardAnswers {
  projectName: string;
  preset: 'core' | 'core+identity';
  network: 'testnet' | 'mainnet';
  // Derived variables
  chainId: string;
  rpcUrl: string;
  networkCaip2: string;
  authMode: string;
  authEnabled: string;
}

export async function runWizard(): Promise<WizardAnswers> {
  console.log();
  p.intro(pc.bgCyan(pc.black(' create-x402-app ')));

  const projectName = await p.text({
    message: 'Project name:',
    placeholder: 'my-x402-app',
    defaultValue: 'my-x402-app',
    validate: (value) => {
      if (!value) return 'Project name is required';
      if (!/^[a-z0-9-]+$/.test(value)) {
        return 'Project name must contain only lowercase letters, numbers, and hyphens';
      }
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  const preset = await p.select({
    message: 'Select template preset:',
    options: [
      { value: 'core', label: 'Core', hint: 'Facilitator + Sandbox + Client + Middleware' },
      { value: 'core+identity', label: 'Core + Identity', hint: 'Core + Attestor + Contracts + Identity CLI' },
    ],
  });

  if (p.isCancel(preset)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  const network = await p.select({
    message: 'Select network:',
    options: [
      { value: 'testnet', label: 'Testnet', hint: 'Conflux eSpace Testnet (Chain ID: 71)' },
      { value: 'mainnet', label: 'Mainnet', hint: 'Conflux eSpace Mainnet (Chain ID: 1030)' },
    ],
  });

  if (p.isCancel(network)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  // Derive variables based on selections
  const chainId = network === 'testnet' ? '71' : '1030';
  const rpcUrl = network === 'testnet'
    ? 'https://evmtestnet.confluxrpc.com'
    : 'https://evm.confluxrpc.com';
  const networkCaip2 = `eip155:${chainId}`;
  const authMode = preset === 'core+identity' ? 'domain_gate' : 'none';
  const authEnabled = preset === 'core+identity' ? 'true' : 'false';

  return {
    projectName: projectName as string,
    preset: preset as 'core' | 'core+identity',
    network: network as 'testnet' | 'mainnet',
    chainId,
    rpcUrl,
    networkCaip2,
    authMode,
    authEnabled,
  };
}
