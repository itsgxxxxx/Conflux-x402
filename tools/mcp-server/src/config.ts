import { z } from 'zod'

const McpConfigSchema = z.object({
  privateKey: z.string().startsWith('0x'),
  rpcUrl: z.string().url().default('https://evm.confluxrpc.com'),
  maxPaymentPerCall: z.coerce.number().default(0.10),
  maxDailySpend: z.coerce.number().default(5.0),
  agentRegistryAddress: z.string().startsWith('0x').optional(),
  discoveryEnabled: z.coerce.boolean().default(true),
})

export type McpConfig = z.infer<typeof McpConfigSchema>

export function loadMcpConfig(): McpConfig {
  return McpConfigSchema.parse({
    privateKey: process.env.X402_PRIVATE_KEY,
    rpcUrl: process.env.X402_RPC_URL,
    maxPaymentPerCall: process.env.X402_MAX_PAYMENT_PER_CALL,
    maxDailySpend: process.env.X402_MAX_DAILY_SPEND,
    agentRegistryAddress: process.env.AGENT_REGISTRY_ADDRESS,
    discoveryEnabled: process.env.X402_DISCOVERY_ENABLED,
  })
}
