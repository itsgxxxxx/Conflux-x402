import { Router } from 'express'
import type { RefundStore } from '../refund/refund-store.js'

export function createRefundRouter(store: RefundStore): Router {
  const router = Router()

  router.get('/:requestId', (req, res) => {
    const record = store.get(req.params.requestId)

    if (!record) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No refund record for this requestId',
      })
      return
    }

    res.json(record)
  })

  return router
}
