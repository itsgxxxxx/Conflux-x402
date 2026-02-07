import type { Request, Response } from 'express'

export function weatherHandler(_req: Request, res: Response): void {
  res.json({
    report: {
      city: 'Conflux City',
      weather: 'sunny',
      temperature: 25,
      unit: 'celsius',
    },
  })
}
