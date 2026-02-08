import { logger } from '../logger.js'

// Use a minimal interface to avoid strict PublicClient chain type mismatches
interface ChainClient {
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
  watchContractEvent(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    eventName: string
    onLogs: (logs: unknown[]) => void
  }): () => void
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

export const AGENT_REGISTRY_EVENTS = [
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: false },
      { name: 'endpoint', type: 'string', indexed: false },
      { name: 'price', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentCapabilitySet',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'capabilityId', type: 'bytes32', indexed: true },
      { name: 'enabled', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentDeactivated',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
    ],
  },
] as const

export interface DiscoveredAgent {
  agentId: number
  wallet: string
  asset: string
  endpoint: string
  price: bigint
  active: boolean
}

/**
 * Full scan: iterate all agentIds, filter by capability
 */
export async function scanForCapability(
  client: ChainClient,
  registryAddress: `0x${string}`,
  capabilityId: `0x${string}`,
): Promise<DiscoveredAgent[]> {
  const nextId = await client.readContract({
    address: registryAddress,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'nextAgentId',
  }) as bigint

  const total = Number(nextId)
  logger.info({ total }, '[scan] scanning registry...')

  const agents: DiscoveredAgent[] = []

  for (let i = 0; i < total; i++) {
    const [, wallet, asset, endpoint, price, active] = await client.readContract({
      address: registryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'getAgent',
      args: [BigInt(i)],
    }) as [string, string, string, string, bigint, boolean]

    if (!active) continue

    const capable = await client.readContract({
      address: registryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'isCapable',
      args: [BigInt(i), capabilityId],
    }) as boolean

    if (capable) {
      agents.push({ agentId: i, wallet, asset, endpoint, price, active })
      logger.info(
        { agentId: i, endpoint, price: price.toString() },
        '[scan] found capable agent',
      )
    }
  }

  logger.info({ found: agents.length }, '[scan] scan complete')
  return agents
}

/**
 * Watch for new agent registrations via event logs (polling-based).
 * Returns an unwatch function.
 */
export function watchAgentEvents(
  client: ChainClient,
  registryAddress: `0x${string}`,
  onRegistered: (agentId: number, wallet: string, endpoint: string, price: bigint) => void,
  onDeactivated: (agentId: number) => void,
): () => void {
  const unwatch = client.watchContractEvent({
    address: registryAddress,
    abi: AGENT_REGISTRY_EVENTS,
    eventName: 'AgentRegistered',
    onLogs: (logs) => {
      for (const log of logs) {
        const entry = log as { args?: Record<string, unknown> }
        const args = entry.args as {
          agentId?: bigint
          wallet?: string
          endpoint?: string
          price?: bigint
        } | undefined
        if (args?.agentId !== undefined) {
          logger.info(
            { agentId: Number(args.agentId), endpoint: args.endpoint },
            '[event] AgentRegistered',
          )
          onRegistered(
            Number(args.agentId),
            args.wallet ?? '',
            args.endpoint ?? '',
            args.price ?? 0n,
          )
        }
      }
    },
  })

  const unwatchDeactivated = client.watchContractEvent({
    address: registryAddress,
    abi: AGENT_REGISTRY_EVENTS,
    eventName: 'AgentDeactivated',
    onLogs: (logs) => {
      for (const log of logs) {
        const entry = log as { args?: Record<string, unknown> }
        const args = entry.args as { agentId?: bigint } | undefined
        if (args?.agentId !== undefined) {
          logger.info({ agentId: Number(args.agentId) }, '[event] AgentDeactivated')
          onDeactivated(Number(args.agentId))
        }
      }
    },
  })

  return () => {
    unwatch()
    unwatchDeactivated()
  }
}
