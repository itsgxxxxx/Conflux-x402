import { z } from 'zod'
import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { RouteConfig, RoutesConfig } from '@x402/core/server'
import type { ServerConfig } from '../config.js'

const PolicySchema = z.union([
  z.string(),
  z.object({
    mode: z.enum(['ALL_OF', 'ANY_OF', 'NONE_OF']),
    tags: z.array(z.string()),
  }),
])

const RefundPolicySchema = z.object({
  enabled: z.boolean().optional(),
  windowSec: z.number().optional(),
}).optional()

const GateRouteConfigSchema = z.object({
  enableIdentity: z.boolean().default(false),
  policy: PolicySchema.optional(),
  enablePayment: z.boolean().default(true),
  price: z.string().optional(),
  amount: z.string().optional(),   // raw units for refund (e.g. '1000' = 0.001 USDT0)
  description: z.string(),
  mimeType: z.string().default('application/json'),
  resourceId: z.string().optional(),
  refund: RefundPolicySchema,
})

export type GateRouteConfig = z.infer<typeof GateRouteConfigSchema>
export type RefundPolicy = z.infer<typeof RefundPolicySchema>

export function buildRoutes(_serverConfig: ServerConfig): Record<string, GateRouteConfig> {
  return {
    'GET /sandbox/weather': GateRouteConfigSchema.parse({
      enableIdentity: false,
      enablePayment: true,
      price: '$0.001',
      amount: '1000',
      description: 'Weather data',
      mimeType: 'application/json',
      resourceId: 'weather',
      refund: { enabled: true },
    }),
  }
}

export function toX402RoutesConfig(
  routes: Record<string, GateRouteConfig>,
  serverConfig: ServerConfig,
): RoutesConfig {
  const { token } = CONFLUX_ESPACE_MAINNET
  const x402Routes: Record<string, RouteConfig> = {}

  for (const [pattern, route] of Object.entries(routes)) {
    if (!route.enablePayment) continue

    x402Routes[pattern] = {
      accepts: [
        {
          scheme: 'exact',
          payTo: serverConfig.evmAddress,
          network: CONFLUX_ESPACE_MAINNET.caip2Id,
          price: {
            amount: route.amount ?? '1000', // 0.001 USDT0 (6 decimals)
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
