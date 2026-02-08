import { z } from 'zod'

const ClientConfigSchema = z.object({
  privateKey: z.string().startsWith('0x'),
  serverUrl: z.string().url(),
  rpcUrl: z.string().url().default('https://evm.confluxrpc.com'),
})

export type ClientConfig = z.infer<typeof ClientConfigSchema>

export function loadClientConfig(): ClientConfig {
  return ClientConfigSchema.parse({
    privateKey: process.env.CLIENT_PRIVATE_KEY,
    serverUrl: process.env.SERVER_URL,
    rpcUrl: process.env.RPC_URL,
  })
}
