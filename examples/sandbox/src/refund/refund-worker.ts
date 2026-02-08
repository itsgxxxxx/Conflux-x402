import { logger } from '../logger.js'
import type { RefundStore } from './refund-store.js'

export type SendRefundTx = (payer: string, amount: string, token: string) => Promise<string>

const DEFAULT_RETRY_DELAY_MS = 3_000

export async function processRefund(
  store: RefundStore,
  requestId: string,
  sendRefundTx: SendRefundTx,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
): Promise<void> {
  const record = store.get(requestId)
  if (!record) {
    logger.warn({ requestId }, 'refund-worker: record not found')
    return
  }

  // CAS: only process if in refund_queued state
  if (!store.transition(requestId, 'refund_queued', 'refund_submitted')) {
    logger.warn({ requestId, state: record.state }, 'refund-worker: unexpected state, skipping')
    return
  }

  try {
    const txHash = await sendRefundTx(record.payer, record.amount, record.token)
    store.update(requestId, { refundTxHash: txHash })
    logger.info({ requestId, txHash }, 'refund-worker: refund submitted')
  } catch (error) {
    logger.warn(
      { requestId, error: error instanceof Error ? error.message : String(error) },
      'refund-worker: first attempt failed, retrying',
    )

    // Single retry after delay
    await new Promise((r) => setTimeout(r, retryDelayMs))

    try {
      const txHash = await sendRefundTx(record.payer, record.amount, record.token)
      store.update(requestId, { refundTxHash: txHash })
      logger.info({ requestId, txHash }, 'refund-worker: refund submitted on retry')
    } catch (retryError) {
      store.transition(requestId, 'refund_submitted', 'refund_failed')
      store.update(requestId, {
        reason: retryError instanceof Error ? retryError.message : String(retryError),
      })
      logger.error(
        { requestId, error: retryError instanceof Error ? retryError.message : String(retryError) },
        'refund-worker: refund failed after retry',
      )
    }
  }
}
