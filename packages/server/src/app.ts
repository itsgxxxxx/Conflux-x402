import express from 'express'
import type { Express } from 'express'
import { createPublicClient, http } from 'viem'
import { paymentMiddleware } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { x402ResourceServer } from '@x402/express'
import { confluxESpace } from '@conflux-x402/chain-config'
import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { ServerConfig } from './config.js'
import { logger } from './logger.js'
import { registerRoutes } from './routes/index.js'
import { buildRoutes, toX402RoutesConfig } from './routes/config.js'
import { createAuthCheckMiddleware } from './middleware/auth-check.js'

export function createApp(config: ServerConfig): Express {
  const app = express()
  app.use(express.json())

  // Build route configs
  const gateRoutes = buildRoutes(config)
  const x402Routes = toX402RoutesConfig(gateRoutes, config)

  logger.info({ routes: Object.keys(x402Routes) }, 'x402 protected routes')

  // Setup auth gate middleware (before x402)
  if (config.authMode !== 'none') {
    const publicClient = createPublicClient({
      chain: confluxESpace,
      transport: http(config.rpcUrl),
    })

    app.use(createAuthCheckMiddleware({ config, publicClient }))

    logger.info(
      { authMode: config.authMode, registryAddress: config.identityRegistryAddress },
      'auth gate enabled',
    )
  } else {
    logger.info('auth gate disabled (AUTH_MODE=none)')
  }

  // Setup x402 payment middleware
  if (config.paymentEnabled) {
    const facilitatorClient = new HTTPFacilitatorClient({
      url: config.facilitatorUrl,
      ...(config.facilitatorApiKey && {
        createAuthHeaders: async () => {
          const h = { 'X-API-Key': config.facilitatorApiKey! }
          return { verify: h, settle: h, supported: h }
        },
      }),
    })

    const exactEvmScheme = new ExactEvmScheme()

    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(CONFLUX_ESPACE_MAINNET.caip2Id, exactEvmScheme)

    app.use(
      paymentMiddleware(
        x402Routes,
        resourceServer,
      ),
    )

    logger.info({ facilitatorUrl: config.facilitatorUrl }, 'x402 payment middleware enabled')
  } else {
    logger.warn('payment middleware DISABLED (PAYMENT_ENABLED=false)')
  }

  // Register business routes
  registerRoutes(app)

  return app
}
