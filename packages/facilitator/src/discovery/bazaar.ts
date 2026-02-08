import { Router } from 'express'
import { scanAgents, checkCapability } from './chain-reader.js'
import { fetchBazaarMetadata } from './metadata-cache.js'
import { logger } from '../logger.js'
import { keccak256, toHex } from 'viem'

type ChainClient = Parameters<typeof scanAgents>[0]

export interface BazaarItem {
  agentId: number
  name: string
  description: string
  endpoint: string
  capabilities: string[]
  accepts: {
    scheme: string
    network: string
    asset: string
    amount: string
    payTo: string
  }
  routes: unknown[]
}

export function createBazaarRouter(
  publicClient: ChainClient,
  registryAddress: `0x${string}`,
  network: string,
): Router {
  const router = Router()

  router.get('/discovery/resources', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100)
      const offset = Number(req.query.offset) || 0
      const capabilityFilter = req.query.capability as string | undefined

      const agents = await scanAgents(publicClient, registryAddress)

      // Filter by capability if requested
      let filtered = agents
      if (capabilityFilter) {
        const capId = keccak256(toHex(capabilityFilter)) as `0x${string}`
        const checks = await Promise.all(
          agents.map(a => checkCapability(publicClient, registryAddress, a.agentId, capId))
        )
        filtered = agents.filter((_, i) => checks[i])
      }

      // Paginate
      const paged = filtered.slice(offset, offset + limit)

      // Fetch metadata and assemble bazaar items
      const items: BazaarItem[] = []
      for (const agent of paged) {
        const metadata = await fetchBazaarMetadata(agent.endpoint)

        items.push({
          agentId: agent.agentId,
          name: metadata?.name ?? `Agent #${agent.agentId}`,
          description: metadata?.description ?? '',
          endpoint: agent.endpoint,
          capabilities: metadata?.capabilities ?? [],
          accepts: {
            scheme: 'exact',
            network,
            asset: agent.asset,
            amount: agent.price.toString(),
            payTo: agent.wallet,
          },
          routes: metadata?.routes ?? [],
        })
      }

      logger.info({ total: filtered.length, returned: items.length, offset, limit }, 'bazaar query')

      res.json({
        resources: items,
        total: filtered.length,
        limit,
        offset,
      })
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'bazaar discovery error',
      )
      res.status(500).json({ error: 'Discovery failed' })
    }
  })

  return router
}
