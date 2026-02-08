import { z } from 'zod'
import type { Caip2Network } from '@conflux-x402/chain-config'

const FacilitatorConfigSchema = z.object({
  port: z.coerce.number().default(4022),
  privateKey: z.string().startsWith('0x'),
  rpcUrl: z.string().url().default('https://evm.confluxrpc.com'),
  network: z.custom<Caip2Network>((value) => {
    return typeof value === 'string' && value.includes(':')
  }).default('eip155:1030'),

  // Safety controls
  verifyOnlyMode: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  maxPerTransaction: z.coerce.number().default(1.0),
  maxDailyTotal: z.coerce.number().default(10.0),
  circuitBreakerThreshold: z.coerce.number().default(10),

  // Service-to-service auth
  facilitatorApiKey: z.string().optional(),

  // Identity registry (observe-only logging, not enforcement)
  identityRegistryAddress: z.string().startsWith('0x').optional(),

  // Gas
  gasBufferPercent: z.coerce.number().default(50),
})

export type FacilitatorConfig = z.infer<typeof FacilitatorConfigSchema>

export function loadConfig(): FacilitatorConfig {
  return FacilitatorConfigSchema.parse({
    port: process.env.FACILITATOR_PORT,
    privateKey: process.env.FACILITATOR_PRIVATE_KEY,
    rpcUrl: process.env.RPC_URL,
    network: process.env.NETWORK,
    verifyOnlyMode: process.env.VERIFY_ONLY_MODE,
    maxPerTransaction: process.env.MAX_PER_TRANSACTION,
    maxDailyTotal: process.env.MAX_DAILY_TOTAL,
    circuitBreakerThreshold: process.env.CIRCUIT_BREAKER_THRESHOLD,
    facilitatorApiKey: process.env.FACILITATOR_API_KEY,
    identityRegistryAddress: process.env.IDENTITY_REGISTRY_ADDRESS,
    gasBufferPercent: process.env.GAS_BUFFER_PERCENT,
  })
}
