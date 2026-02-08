import { z } from 'zod'

const BuyerAgentConfigSchema = z.object({
  privateKey: z.string().startsWith('0x'),
  facilitatorUrl: z.string().url(),
  agentRegistryAddress: z.string().startsWith('0x'),
  rpcUrl: z.string().url().default('https://evm.confluxrpc.com'),
  chainId: z.coerce.number().default(1030),
})

export type BuyerAgentConfig = z.infer<typeof BuyerAgentConfigSchema>

export function loadBuyerAgentConfig(): BuyerAgentConfig {
  return BuyerAgentConfigSchema.parse({
    privateKey: process.env.BUYER_PRIVATE_KEY,
    facilitatorUrl: process.env.FACILITATOR_URL,
    agentRegistryAddress: process.env.AGENT_REGISTRY_ADDRESS,
    rpcUrl: process.env.RPC_URL,
    chainId: process.env.CHAIN_ID,
  })
}
