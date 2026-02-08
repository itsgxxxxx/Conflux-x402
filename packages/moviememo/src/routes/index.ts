import type { Express } from 'express'
import { healthHandler } from './health.js'
import { movieInfoHandler } from './movie-info.js'
import { careerTrendsHandler } from './career-trends.js'
import { soundtrackHandler } from './soundtrack.js'

export function registerRoutes(app: Express): void {
  // Health check (free)
  app.get('/health', healthHandler)

  // Paid endpoints
  app.post('/api/movie-info', movieInfoHandler)
  app.post('/api/career-trends', careerTrendsHandler)
  app.post('/api/soundtrack', soundtrackHandler)
}
