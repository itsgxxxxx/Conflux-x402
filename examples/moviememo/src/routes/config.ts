import { z } from 'zod'

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
