import type { Request, Response } from 'express'

const bazaarMetadata = {
  name: 'MovieMemo Agent',
  description: 'Movie insights: info, career trends, and soundtrack hints',
  capabilities: ['movie-info', 'career-trends', 'soundtrack'],
  routes: [
    {
      path: '/api/movie-info',
      method: 'POST',
      description: 'Movie basic information',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
      output: {
        type: 'object',
        properties: {
          data: { type: 'object' },
        },
      },
    },
    {
      path: '/api/career-trends',
      method: 'POST',
      description: 'Director or actor career trends analysis',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          type: { enum: ['director', 'actor'] },
        },
        required: ['query', 'type'],
      },
      output: {
        type: 'object',
        properties: {
          data: { type: 'object' },
        },
      },
    },
    {
      path: '/api/soundtrack',
      method: 'POST',
      description: 'Movie soundtrack with YouTube Music links',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
      output: {
        type: 'object',
        properties: {
          data: { type: 'object' },
        },
      },
    },
  ],
}

export function wellKnownBazaarHandler(_req: Request, res: Response): void {
  res.json(bazaarMetadata)
}
