import { z } from 'zod'

const ServerConfigSchema = z.object({
  port: z.coerce.number().default(4021),
  facilitatorUrl: z.string().url(),
  evmAddress: z.string().startsWith('0x'),
  paymentEnabled: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
})

export type ServerConfig = z.infer<typeof ServerConfigSchema>

export function loadServerConfig(): ServerConfig {
  return ServerConfigSchema.parse({
    port: process.env.SERVER_PORT,
    facilitatorUrl: process.env.FACILITATOR_URL,
    evmAddress: process.env.EVM_ADDRESS,
    paymentEnabled: process.env.PAYMENT_ENABLED,
  })
}
