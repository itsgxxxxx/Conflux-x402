import { z } from 'zod'
import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { RouteConfig, RoutesConfig } from '@x402/core/server'
import type { MovieMemoConfig } from '../config.js'

const GateRouteConfigSchema = z.object({
  enablePayment: z.boolean().default(true),
  price: z.string().optional(),
  description: z.string(),
  mimeType: z.string().default('application/json'),
})

export type GateRouteConfig = z.infer<typeof GateRouteConfigSchema>

export function buildRoutes(): Record<string, GateRouteConfig> {
  return {
    'POST /api/movie-info': GateRouteConfigSchema.parse({
      enablePayment: true,
      price: '$0.001',
      description: 'Movie basic information',
      mimeType: 'application/json',
    }),
    'POST /api/career-trends': GateRouteConfigSchema.parse({
      enablePayment: true,
      price: '$0.001',
      description: 'Director/Actor career trends analysis',
      mimeType: 'application/json',
    }),
    'POST /api/soundtrack': GateRouteConfigSchema.parse({
      enablePayment: true,
      price: '$0.001',
      description: 'Movie soundtrack with YouTube links',
      mimeType: 'application/json',
    }),
  }
}

export function toX402RoutesConfig(
  routes: Record<string, GateRouteConfig>,
  config: MovieMemoConfig,
): RoutesConfig {
  const { token } = CONFLUX_ESPACE_MAINNET
  const x402Routes: Record<string, RouteConfig> = {}

  for (const [pattern, route] of Object.entries(routes)) {
    if (!route.enablePayment) continue

    x402Routes[pattern] = {
      accepts: [
        {
          scheme: 'exact',
          payTo: config.evmAddress,
          network: CONFLUX_ESPACE_MAINNET.caip2Id,
          price: {
            amount: '1000', // 0.001 USDT0 (6 decimals)
            asset: token.address,
            extra: {
              name: token.eip712.name,
              version: token.eip712.version,
            },
          },
        },
      ],
      description: route.description,
      mimeType: route.mimeType,
    }
  }

  return x402Routes
}
