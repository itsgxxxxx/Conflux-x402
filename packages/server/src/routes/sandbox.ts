import type { Request, Response } from 'express'

export function weatherHandler(req: Request, res: Response): void {
  // Demo mode: simulate business failure for refund demonstration
  if (req.query.demo_refund === '1') {
    res.setHeader('X-Refund-Requested', '1')
    res.setHeader('X-Refund-Status', 'pending')
    if (req.ctx?.requestId) {
      res.setHeader('X-Request-Id', req.ctx.requestId)
    }
    res.json({
      ok: false,
      error: 'SIMULATED_FAILURE',
      message: 'Demo: simulated business failure to trigger refund',
    })
    return
  }

  res.json({
    report: {
      city: 'Conflux City',
      weather: 'sunny',
      temperature: 25,
      unit: 'celsius',
    },
  })
}
