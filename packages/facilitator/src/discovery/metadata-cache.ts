import { logger } from '../logger.js'

export interface BazaarMetadata {
  name: string
  description: string
  capabilities: string[]
  routes: Array<{
    path: string
    method: string
    description: string
    input?: unknown
    output?: unknown
  }>
}

interface CacheEntry {
  data: BazaarMetadata
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 30_000 // 30 seconds

export async function fetchBazaarMetadata(endpoint: string): Promise<BazaarMetadata | null> {
  const cached = cache.get(endpoint)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const url = `${endpoint.replace(/\/$/, '')}/.well-known/x402-bazaar.json`

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'bazaar metadata fetch failed')
      return null
    }

    const data = await response.json() as BazaarMetadata
    cache.set(endpoint, { data, expiresAt: Date.now() + TTL_MS })
    return data
  } catch (error) {
    logger.warn(
      { url, error: error instanceof Error ? error.message : String(error) },
      'bazaar metadata fetch error',
    )
    return null
  }
}
