import { z } from 'zod'

const ClientConfigSchema = z.object({
  privateKey: z.string().startsWith('0x'),
  serverUrl: z.string().url(),
  rpcUrl: z.string().url().default('https://evm.confluxrpc.com'),
  authEnabled: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  chainId: z.coerce.number().default(1030),
})

export type ClientConfig = z.infer<typeof ClientConfigSchema>

export function loadClientConfig(): ClientConfig {
  return ClientConfigSchema.parse({
    privateKey: process.env.CLIENT_PRIVATE_KEY,
    serverUrl: process.env.SERVER_URL,
    rpcUrl: process.env.RPC_URL,
    authEnabled: process.env.AUTH_ENABLED,
    chainId: process.env.CHAIN_ID,
  })
}
