import { createPublicClient, http, keccak256, toHex } from 'viem'
import { confluxESpace } from '@conflux-x402/chain-config'
import type { McpConfig } from '../config.js'

interface DiscoverAgentsArgs {
  capability: string
  limit?: number
  max_scan?: number
  include_bazaar?: boolean
}

const REGISTRY_ABI = [
  {
    name: 'nextAgentId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getAgent',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'wallet', type: 'address' },
      { name: 'asset', type: 'address' },
      { name: 'endpoint', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    name: 'isCapable',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'capabilityId', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

interface BazaarSummary {
  ok: boolean
  status?: number
  error?: string
  name?: string
  capabilities?: string[]
  routes?: number
}

function toBazaarSummary(raw: unknown): BazaarSummary {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: true, name: 'unknown', capabilities: [], routes: 0 }
  }

  const obj = raw as Record<string, unknown>
  const capabilities = Array.isArray(obj.capabilities)
    ? obj.capabilities.filter((item): item is string => typeof item === 'string')
    : []
  const routes = Array.isArray(obj.routes) ? obj.routes.length : 0

  return {
    ok: true,
    name: typeof obj.name === 'string' ? obj.name : 'unknown',
    capabilities,
    routes,
  }
}

async function fetchBazaarSummary(endpoint: string): Promise<BazaarSummary> {
  try {
    const normalized = endpoint.replace(/\/$/, '')
    const response = await fetch(`${normalized}/.well-known/x402-bazaar.json`)
    if (!response.ok) {
      return { ok: false, status: response.status }
    }
    const data: unknown = await response.json()
    return toBazaarSummary(data)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function discoverAgentsTool(
  args: DiscoverAgentsArgs,
  config: McpConfig,
): Promise<string> {
  if (!config.discoveryEnabled) {
    return 'Error: discovery is disabled (X402_DISCOVERY_ENABLED=false)'
  }

  if (!config.agentRegistryAddress) {
    return 'Error: AGENT_REGISTRY_ADDRESS is not configured'
  }

  const {
    capability,
    limit = 5,
    max_scan = 200,
    include_bazaar = true,
  } = args

  if (!capability || capability.trim().length === 0) {
    return 'Error: capability is required'
  }

  const publicClient = createPublicClient({
    chain: confluxESpace,
    transport: http(config.rpcUrl),
  })

  const capabilityId = keccak256(toHex(capability.trim())) as `0x${string}`
  const nextAgentId = await publicClient.readContract({
    address: config.agentRegistryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: 'nextAgentId',
  })

  const maxId = Number(nextAgentId)
  const scanLimit = Math.min(maxId, Math.max(0, max_scan))
  const matches: Array<Record<string, unknown>> = []

  for (let agentId = 0; agentId < scanLimit; agentId += 1) {
    const isCapable = await publicClient.readContract({
      address: config.agentRegistryAddress as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'isCapable',
      args: [BigInt(agentId), capabilityId],
    })

    if (!isCapable) continue

    const [owner, wallet, asset, endpoint, price, active] =
      await publicClient.readContract({
        address: config.agentRegistryAddress as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'getAgent',
        args: [BigInt(agentId)],
      })

    if (!active) continue

    const entry: Record<string, unknown> = {
      agentId,
      owner,
      wallet,
      asset,
      endpoint,
      price: price.toString(),
    }

    if (include_bazaar && typeof endpoint === 'string' && endpoint.length > 0) {
      entry.bazaar = await fetchBazaarSummary(endpoint)
    }

    matches.push(entry)
    if (matches.length >= limit) break
  }

  return JSON.stringify(
    {
      capability,
      scanned: scanLimit,
      found: matches.length,
      agents: matches,
    },
    null,
    2,
  )
}
