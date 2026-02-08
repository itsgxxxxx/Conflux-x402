import { z } from 'zod'

const MovieMemoConfigSchema = z.object({
  port: z.coerce.number().default(4021),
  facilitatorUrl: z.string().url(),
  evmAddress: z.string().startsWith('0x'),
  paymentEnabled: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  tmdbApiKey: z.string().min(1),
})

export type MovieMemoConfig = z.infer<typeof MovieMemoConfigSchema>

export function loadMovieMemoConfig(): MovieMemoConfig {
  return MovieMemoConfigSchema.parse({
    port: process.env.SERVER_PORT,
    facilitatorUrl: process.env.FACILITATOR_URL,
    evmAddress: process.env.EVM_ADDRESS,
    paymentEnabled: process.env.PAYMENT_ENABLED,
    tmdbApiKey: process.env.TMDB_API_KEY,
  })
}
