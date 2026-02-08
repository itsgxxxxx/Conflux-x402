import express from 'express'
import type { Express } from 'express'
import { createX402Middleware } from '@conflux-x402/express-middleware'
import type { MovieMemoConfig } from './config.js'
import { logger } from './logger.js'
import { registerRoutes } from './routes/index.js'
import { buildRoutes } from './routes/config.js'

export function createApp(config: MovieMemoConfig): Express {
  const app = express()
  app.use(express.json())

  // Build route configs
  const gateRoutes = buildRoutes()

  const middleware = createX402Middleware({
    facilitatorUrl: config.facilitatorUrl,
    evmAddress: config.evmAddress,
    routes: gateRoutes,
    paymentEnabled: config.paymentEnabled,
    logger,
  })

  if (middleware) {
    app.use(middleware)
  }

  // Register business routes
  registerRoutes(app)

  return app
}
