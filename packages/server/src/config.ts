import { z } from 'zod'

const AuthModeSchema = z.enum(['none', 'domain_gate']).default('none')

const ServerConfigSchema = z.object({
  port: z.coerce.number().default(4021),
  facilitatorUrl: z.string().url(),
  evmAddress: z.string().startsWith('0x'),
  paymentEnabled: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // Auth gate
  authMode: AuthModeSchema,
  identityRegistryAddress: z.string().startsWith('0x').optional(),
  rpcUrl: z.string().url().default('https://evm.confluxrpc.com'),
  chainId: z.coerce.number().default(1030),

  // Service-to-service
  facilitatorApiKey: z.string().optional(),

  // Refund
  refundDefault: z.enum(['off', 'on']).default('off'),
  serverPrivateKey: z.string().startsWith('0x').optional(),
})

export type AuthMode = z.infer<typeof AuthModeSchema>
export type ServerConfig = z.infer<typeof ServerConfigSchema>

export function loadServerConfig(): ServerConfig {
  const config = ServerConfigSchema.parse({
    port: process.env.SERVER_PORT,
    facilitatorUrl: process.env.FACILITATOR_URL,
    evmAddress: process.env.EVM_ADDRESS,
    paymentEnabled: process.env.PAYMENT_ENABLED,
    authMode: process.env.AUTH_MODE,
    identityRegistryAddress: process.env.IDENTITY_REGISTRY_ADDRESS,
    rpcUrl: process.env.RPC_URL,
    chainId: process.env.CHAIN_ID,
    facilitatorApiKey: process.env.FACILITATOR_API_KEY,
    refundDefault: process.env.REFUND_DEFAULT,
    serverPrivateKey: process.env.SERVER_PRIVATE_KEY,
  })

  if (config.authMode === 'domain_gate' && !config.identityRegistryAddress) {
    throw new Error('IDENTITY_REGISTRY_ADDRESS is required when AUTH_MODE=domain_gate')
  }

  if (config.refundDefault === 'on' && !config.serverPrivateKey) {
    throw new Error('SERVER_PRIVATE_KEY is required when REFUND_DEFAULT=on')
  }

  return config
}
