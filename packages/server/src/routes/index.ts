import type { Express } from 'express'
import { healthHandler } from './health.js'
import { weatherHandler } from './sandbox.js'

export function registerRoutes(app: Express): void {
  app.get('/health', healthHandler)
  app.get('/sandbox/weather', weatherHandler)
}
