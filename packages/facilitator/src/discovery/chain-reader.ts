import { logger } from '../logger.js'

interface ChainClient {
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
}

export const AGENT_REGISTRY_ABI = [
  {
    name: 'nextAgentId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getAgent',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'wallet', type: 'address' },
      { name: 'asset', type: 'address' },
      { name: 'endpoint', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'isCapable',
    type: 'function',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'capabilityId', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export interface ChainAgent {
  agentId: number
  owner: string
  wallet: string
  asset: string
  endpoint: string
  price: bigint
  active: boolean
}

export async function scanAgents(
  client: ChainClient,
  registryAddress: `0x${string}`,
): Promise<ChainAgent[]> {
  const nextId = await client.readContract({
    address: registryAddress,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'nextAgentId',
  }) as bigint

  const total = Number(nextId)
  logger.info({ total }, 'scanning registry agents')

  const agents: ChainAgent[] = []

  for (let i = 0; i < total; i++) {
    const result = await client.readContract({
      address: registryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'getAgent',
      args: [BigInt(i)],
    }) as [string, string, string, string, bigint, boolean]

    const [owner, wallet, asset, endpoint, price, active] = result

    if (active) {
      agents.push({ agentId: i, owner, wallet, asset, endpoint, price, active })
    }
  }

  logger.info({ active: agents.length, total }, 'registry scan complete')
  return agents
}

export async function checkCapability(
  client: ChainClient,
  registryAddress: `0x${string}`,
  agentId: number,
  capabilityId: `0x${string}`,
): Promise<boolean> {
  return await client.readContract({
    address: registryAddress,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'isCapable',
    args: [BigInt(agentId), capabilityId],
  }) as boolean
}
