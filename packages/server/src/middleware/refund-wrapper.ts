import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { logger } from '../logger.js'
import type { RefundStore } from '../refund/refund-store.js'

export interface RouteRefundInfo {
  enabled: boolean
  amount: string
  token: string
  network: string
}

export interface RefundWrapperDeps {
  store: RefundStore
  routeRefundConfig: Record<string, RouteRefundInfo>
  refundDefault: 'off' | 'on'
  enqueueRefund: (requestId: string) => Promise<void>
}

declare global {
  namespace Express {
    interface Request {
      ctx?: {
        payer?: string
        requestId?: string
        routeKey?: string
      }
    }
  }
}

export function createRefundWrapper(deps: RefundWrapperDeps) {
  const { store, routeRefundConfig, refundDefault, enqueueRefund } = deps

  return (req: Request, res: Response, next: NextFunction) => {
    // Ensure req.ctx exists
    if (!req.ctx) req.ctx = {}

    // Assign requestId: client-provided or server-generated
    const clientRequestId = req.headers['x-request-id'] as string | undefined
    const requestId = clientRequestId || randomUUID()
    req.ctx.requestId = requestId

    // Echo requestId back in response
    res.setHeader('X-Request-Id', requestId)

    // Determine route key for refund config lookup
    const routeKey = `${req.method.toUpperCase()} ${req.path}`
    req.ctx.routeKey = routeKey

    // Listen for response completion
    res.on('finish', () => {
      try {
        // Guard 1: X-Refund-Requested must be '1'
        const refundRequested = res.getHeader('x-refund-requested')
        if (refundRequested !== '1') return

        // Guard 2: settlement tx must exist (payment was collected)
        const settleTxHash = res.getHeader('x-settlement-transaction') as string | undefined
        if (!settleTxHash) {
          logger.warn({ requestId }, 'refund-wrapper: refund requested but no settlement tx')
          return
        }

        // Guard 3: requestId must exist (always true at this point, but be safe)
        if (!requestId) return

        // Guard 4: route refund must be enabled
        const routeConfig = routeRefundConfig[routeKey]
        const refundEnabled = routeConfig?.enabled ?? (refundDefault === 'on')
        if (!refundEnabled) {
          logger.info({ requestId, routeKey }, 'refund-wrapper: refund not enabled for route')
          return
        }

        // Get payer from request context (set by auth-check middleware)
        const payer = req.ctx?.payer
        if (!payer) {
          logger.warn({ requestId }, 'refund-wrapper: refund requested but no payer in context')
          return
        }

        // Create record and CAS to refund_queued
        const record = store.create({
          requestId,
          payer,
          amount: routeConfig.amount,
          token: routeConfig.token,
          network: routeConfig.network,
          settleTxHash,
        })

        if (!record) {
          logger.warn({ requestId }, 'refund-wrapper: duplicate requestId, already in store')
          return
        }

        if (!store.transition(requestId, 'settled', 'refund_queued')) {
          logger.warn({ requestId }, 'refund-wrapper: CAS settled->refund_queued failed')
          return
        }

        logger.info({ requestId, payer, amount: routeConfig.amount }, 'refund-wrapper: refund queued')

        // Fire-and-forget async refund
        enqueueRefund(requestId).catch((err) => {
          logger.error(
            { requestId, error: err instanceof Error ? err.message : String(err) },
            'refund-wrapper: enqueue failed',
          )
        })
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'refund-wrapper: finish callback error',
        )
      }
    })

    next()
  }
}
