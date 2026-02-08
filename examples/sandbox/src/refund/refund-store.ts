import { logger } from '../logger.js'

export type RefundState = 'settled' | 'refund_queued' | 'refund_submitted' | 'refund_failed'

export interface RefundRecord {
  requestId: string
  payer: string
  amount: string
  token: string
  network: string
  settleTxHash: string
  refundTxHash?: string
  reason?: string
  state: RefundState
  createdAt: number
}

export interface CreateRefundInput {
  requestId: string
  payer: string
  amount: string
  token: string
  network: string
  settleTxHash: string
  reason?: string
}

export class RefundStore {
  private readonly records = new Map<string, { record: RefundRecord; expiresAt: number }>()
  private cleanupTimer: ReturnType<typeof setInterval> | undefined
  private readonly ttlMs: number

  constructor(cleanupIntervalMs = 60_000, ttlMs = 30 * 60_000) {
    this.ttlMs = ttlMs
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs)
    this.cleanupTimer.unref()
  }

  create(input: CreateRefundInput): RefundRecord | null {
    if (this.records.has(input.requestId)) {
      logger.warn({ requestId: input.requestId }, 'refund-store: duplicate requestId, skipping')
      return null
    }

    const record: RefundRecord = {
      ...input,
      state: 'settled',
      createdAt: Date.now(),
    }

    this.records.set(input.requestId, {
      record,
      expiresAt: Date.now() + this.ttlMs,
    })

    return record
  }

  get(requestId: string): RefundRecord | null {
    const entry = this.records.get(requestId)
    if (!entry) return null
    if (Date.now() >= entry.expiresAt) {
      this.records.delete(requestId)
      return null
    }
    return entry.record
  }

  transition(requestId: string, from: RefundState, to: RefundState): boolean {
    const entry = this.records.get(requestId)
    if (!entry || entry.record.state !== from) return false
    entry.record.state = to
    return true
  }

  update(requestId: string, fields: Partial<Pick<RefundRecord, 'refundTxHash' | 'reason'>>): void {
    const entry = this.records.get(requestId)
    if (!entry) return
    Object.assign(entry.record, fields)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [id, entry] of this.records) {
      if (now >= entry.expiresAt) {
        this.records.delete(id)
      }
    }
  }

  get size(): number {
    return this.records.size
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.records.clear()
  }
}
