import type { Request, Response } from 'express'

export function healthHandler(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'moviememo',
    timestamp: new Date().toISOString(),
  })
}
