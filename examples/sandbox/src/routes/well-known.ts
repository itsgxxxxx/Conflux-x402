import type { Request, Response } from 'express'

const bazaarMetadata = {
  name: 'Chart Agent',
  description: 'Generates charts from structured data',
  capabilities: ['chart-generation'],
  routes: [
    {
      path: '/chart/render',
      method: 'GET',
      description: 'Render a chart from input data',
      input: {
        type: 'object',
        properties: {
          type: { enum: ['bar', 'line', 'pie'] },
        },
      },
      output: {
        type: 'object',
        properties: {
          chartType: { type: 'string' },
          data: { type: 'object' },
          renderedAt: { type: 'string' },
        },
      },
    },
  ],
}

export function wellKnownBazaarHandler(_req: Request, res: Response): void {
  res.json(bazaarMetadata)
}
