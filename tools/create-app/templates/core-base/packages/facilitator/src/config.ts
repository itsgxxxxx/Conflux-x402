import { z } from 'zod'
import type { Caip2Network } from '@{{PROJECT_NAME}}/chain-config'

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
  allowedPayerAddresses: z
    .string()
    .transform((v) => (v ? v.split(',').map((a) => a.trim().toLowerCase()) : []))
    .default(''),
  maxPerTransaction: z.coerce.number().default(1.0),
  maxDailyTotal: z.coerce.number().default(10.0),
  circuitBreakerThreshold: z.coerce.number().default(10),

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
    allowedPayerAddresses: process.env.ALLOWED_PAYER_ADDRESSES,
    maxPerTransaction: process.env.MAX_PER_TRANSACTION,
    maxDailyTotal: process.env.MAX_DAILY_TOTAL,
    circuitBreakerThreshold: process.env.CIRCUIT_BREAKER_THRESHOLD,
    gasBufferPercent: process.env.GAS_BUFFER_PERCENT,
  })
}
