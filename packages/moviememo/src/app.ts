import express from 'express'
import type { Express } from 'express'
import { paymentMiddleware } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { x402ResourceServer } from '@x402/express'
import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { MovieMemoConfig } from './config.js'
import { logger } from './logger.js'
import { registerRoutes } from './routes/index.js'
import { buildRoutes, toX402RoutesConfig } from './routes/config.js'

export function createApp(config: MovieMemoConfig): Express {
  const app = express()
  app.use(express.json())

  // Build route configs
  const gateRoutes = buildRoutes()
  const x402Routes = toX402RoutesConfig(gateRoutes, config)

  logger.info({ routes: Object.keys(x402Routes) }, 'x402 protected routes')

  // Setup x402 payment middleware
  if (config.paymentEnabled) {
    const facilitatorClient = new HTTPFacilitatorClient({
      url: config.facilitatorUrl,
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
