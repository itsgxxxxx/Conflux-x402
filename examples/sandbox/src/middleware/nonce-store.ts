/**
 * In-memory nonce store with TTL-based expiry for replay protection.
 * Each nonce is stored with an expiry timestamp. Expired nonces are
 * cleaned up automatically on a configurable interval.
 */
export class NonceStore {
  private readonly seen = new Map<string, number>() // nonce → expiresAt (ms)
  private cleanupTimer: ReturnType<typeof setInterval> | undefined

  constructor(cleanupIntervalMs = 60_000) {
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs)
    this.cleanupTimer.unref()
  }

  has(nonce: string): boolean {
    const expiresAt = this.seen.get(nonce)
    if (expiresAt === undefined) return false
    if (Date.now() >= expiresAt) {
      this.seen.delete(nonce)
      return false
    }
    return true
  }

  add(nonce: string, ttlMs: number): void {
    this.seen.set(nonce, Date.now() + ttlMs)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [nonce, expiresAt] of this.seen) {
      if (now >= expiresAt) {
        this.seen.delete(nonce)
      }
    }
  }

  get size(): number {
    return this.seen.size
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.seen.clear()
  }
}
