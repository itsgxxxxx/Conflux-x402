import type { Express } from 'express'
import { healthHandler } from './health.js'
import { weatherHandler } from './sandbox.js'
import { chartHandler } from './chart.js'
import { wellKnownBazaarHandler } from './well-known.js'

export function registerRoutes(app: Express): void {
  app.get('/health', healthHandler)
  app.get('/sandbox/weather', weatherHandler)
  app.get('/chart/render', chartHandler)
}

/** Routes that should remain public for discovery clients */
export function registerPublicRoutes(app: Express): void {
  app.get('/.well-known/x402-bazaar.json', wellKnownBazaarHandler)
}
