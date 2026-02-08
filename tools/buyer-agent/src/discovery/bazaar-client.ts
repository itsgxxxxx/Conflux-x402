import { logger } from '../logger.js'

export interface BazaarResource {
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
  routes: Array<{
    path: string
    method: string
    description: string
    input?: unknown
    output?: unknown
  }>
}

export interface BazaarResponse {
  resources: BazaarResource[]
  total: number
  limit: number
  offset: number
}

export async function queryBazaar(
  facilitatorUrl: string,
  capability?: string,
  limit = 20,
  offset = 0,
): Promise<BazaarResponse> {
  const params = new URLSearchParams()
  if (capability) params.set('capability', capability)
  params.set('limit', String(limit))
  params.set('offset', String(offset))

  const url = `${facilitatorUrl.replace(/\/$/, '')}/discovery/resources?${params}`
  logger.info({ url }, '[discover] querying bazaar')

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Bazaar query failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as BazaarResponse

  logger.info(
    { total: data.total, returned: data.resources.length },
    '[discover] bazaar response',
  )

  return data
}
