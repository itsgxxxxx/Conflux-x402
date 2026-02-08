import { z } from 'zod'
import type { ServerConfig } from '../config.js'

const PolicySchema = z.union([
  z.string(),
  z.object({
    mode: z.enum(['ALL_OF', 'ANY_OF', 'NONE_OF']),
    tags: z.array(z.string()),
  }),
])

const GateRouteConfigSchema = z.object({
  enableIdentity: z.boolean().default(false),
  policy: PolicySchema.optional(),
  enablePayment: z.boolean().default(true),
  price: z.string().optional(),
  description: z.string(),
  mimeType: z.string().default('application/json'),
  resourceId: z.string().optional(),
})

export type GateRouteConfig = z.infer<typeof GateRouteConfigSchema>

export function buildRoutes(_serverConfig: ServerConfig): Record<string, GateRouteConfig> {
  return {
    'GET /sandbox/weather': GateRouteConfigSchema.parse({
      enableIdentity: false,
      enablePayment: true,
      price: '$0.001',
      description: 'Weather data',
      mimeType: 'application/json',
      resourceId: 'weather',
    }),
  }
}
