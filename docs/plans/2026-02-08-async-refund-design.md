# Async Refund Design: Charge-After-Service, Refund-On-Business-Failure

**Date:** 2026-02-08
**Scope:** PoC / Hackathon — minimal viable refund for the Conflux x402 server
**Principle:** Settled payment + business failure → server-initiated async ERC20 refund

---

## 1. Scenario

The **only** refund scenario covered:

> x402 settlement has occurred (merchant received funds), but the business layer
> determines the service "did not fulfill its promise" and needs to reverse the charge.

Examples:
- External API returned dirty/missing data
- Model inference quality below threshold (returned 200 but `ok: false`)
- Post-execution policy or fraud check failure

**Out of scope (Future work):** reconciliation for network partitions, duplicate
settlements, partial refunds, escrow-based two-phase settlement.

---

## 2. Architecture

### Middleware Chain

```
Request → JSON Parser → Auth Check → Refund Wrapper → x402 Payment → Route Handler → Response
                          (req.ctx.payer)    ↓
                                        res.on('finish')
                                             ↓
                                        Guard checks:
                                          1. X-Refund-Requested === '1'?
                                          2. settleTxHash exists?
                                          3. requestId exists?
                                          4. route refund enabled?
                                             ↓ all pass
                                        Enqueue async refund
```

### Key Decisions

- **Refund Wrapper registers before x402 middleware** so that its `res.on('finish')`
  listener fires after x402 completes settle + replay.
- **Does not modify @x402/express source code.** The x402 middleware's internal
  settle → setHeader → replay sequence is untouched.
- **Refund is asynchronous.** The HTTP response returns immediately with settlement
  proof and `X-Refund-Status: pending`. A background worker submits the refund
  transaction within seconds.
- **Only `finish` event is monitored.** The `close` event (client disconnect) is
  listed as Future work.

### Request Context

The refund wrapper establishes `req.ctx`:

```typescript
req.ctx = {
  payer: string       // from auth-check ecrecover (trusted)
  requestId: string   // from X-Request-Id header or server-generated UUID
  routeKey: string    // matched route path
}
```

Using a `ctx` namespace avoids collisions with other middleware.

---

## 3. Configuration

### Environment Variables

```
REFUND_DEFAULT=off          # global default (safe)
SERVER_PRIVATE_KEY=0x...    # existing; signs refund transactions
```

### Route Config Extension

```typescript
type RefundPolicy = {
  enabled?: boolean     // omitted → follows REFUND_DEFAULT
  windowSec?: number    // refund time window, default 120s (reserved, not used in PoC)
}

type RouteConfig = {
  price: string         // display only (e.g. '$0.001')
  amount: string        // raw units for refund calculation (e.g. '1000')
  scheme: string
  // ... existing fields
  refund?: RefundPolicy
}
```

### PoC Demo Config

```typescript
'/sandbox/weather': {
  price: '$0.001',
  amount: '1000',
  scheme: 'exact',
  refund: { enabled: true }
}
```

### Resolution Rules

- `refund` omitted → follow `REFUND_DEFAULT` (default: `off`)
- `refund.enabled` set → overrides global

### Refund Amount

- Always uses **raw units** (`amount` field) + token contract address
- `price` (e.g. `'$0.001'`) is display-only, never used in refund calculation

---

## 4. Refund Signal Protocol

### Headers

| Header | Set By | Purpose |
|--------|--------|---------|
| `X-Request-Id` | Refund wrapper (or client) | Idempotency key; client can provide, server generates if missing |
| `X-Refund-Requested` | Route handler | `'1'` = business requests refund |
| `X-Refund-Status` | Route handler | `'pending'` = tells client refund is queued |

### Route Handler Example

```typescript
// Business determines service failed
res.setHeader('X-Refund-Requested', '1')
res.setHeader('X-Refund-Status', 'pending')
res.setHeader('X-Request-Id', req.ctx.requestId)
res.status(200).json({ ok: false, error: 'DIRTY_DATA' })
```

Note: `X-Refund-Status` must be set by the handler (before `res.end()`), not by the
`finish` callback — the response is already sent by the time `finish` fires.

---

## 5. State Machine

```
settled → refund_queued → refund_submitted
               ↓                ↓
           (no-op if       refund_failed
            duplicate)
```

| State | Meaning |
|-------|---------|
| `settled` | x402 settlement complete; payer/amount/settleTxHash recorded |
| `refund_queued` | finish callback passed guards; async worker will process |
| `refund_submitted` | ERC20 transfer tx sent; refundTxHash recorded |
| `refund_failed` | tx send failed after retry; error reason recorded |

**PoC treats `refund_submitted` as final.** Chain confirmation (`refund_confirmed`)
is Future work.

### Idempotency

- Key = `requestId`
- `settled → refund_queued` transition allowed exactly once per requestId (CAS)
- Duplicate triggers return `already_queued` / `already_refunded`, no-op

### RefundRecord

```typescript
type RefundState = 'settled' | 'refund_queued' | 'refund_submitted' | 'refund_failed'

type RefundRecord = {
  requestId: string
  payer: string            // ecrecover trusted address
  amount: string           // raw units (e.g. '1000')
  token: string            // ERC20 contract address
  network: string          // caip2Id (e.g. 'eip155:1030')
  settleTxHash: string
  refundTxHash?: string
  reason?: string
  state: RefundState
  createdAt: number
}
```

### Storage

- In-memory `Map<requestId, RefundRecord>` with TTL (30 min)
- Cleanup interval: 60s (consistent with NonceStore pattern)
- Cleanup only affects memory; on-chain transactions are immutable

---

## 6. Refund Execution

### finish Callback (Refund Wrapper)

```
finish fires
  → guard 1: X-Refund-Requested === '1'?     (most requests skip here)
  → guard 2: settleTxHash exists?
  → guard 3: requestId exists?
  → guard 4: route refund enabled?
  → build RefundRecord { state: 'settled' }
  → CAS: settled → refund_queued (fail → no-op)
  → enqueue async task
```

Entire callback wrapped in try/catch — exceptions are logged, never thrown
(response is already sent).

### Async Worker (same process, `setImmediate`)

```
dequeue refund_queued record
  → CAS: refund_queued → refund_submitted
  → build ERC20 transfer: token.transfer(record.payer, record.amount)
  → sign + send via walletClient.writeContract() using SERVER_PRIVATE_KEY
  → success: record refundTxHash
  → failure:
      → revert state to refund_failed
      → retry once after 3s delay
      → still fails: keep refund_failed, record error reason
```

### On-Chain Details

- Uses viem `walletClient.writeContract()` for ERC20 transfer
- Chain from chain-config (same chain as settlement)
- Gas estimation: default (no fine-tuning in PoC)
- Single retry, no exponential backoff (Future work)

### Gas & Funds

- Refund wallet = merchant wallet (`SERVER_PRIVATE_KEY`), same as payment recipient
- Must hold CFX for gas
- Refund token (USDT0) comes from received payments (merchant balance)
- Production should separate payment/refund wallets

---

## 7. Query API

### Endpoint

```
GET /refunds/:requestId
```

No payment required. No auth required (PoC simplification; production should add auth).

### Response (found)

```json
{
  "requestId": "abc-123",
  "state": "refund_submitted",
  "payer": "0x...",
  "amount": "1000",
  "token": "0xaf37E8B6C9ED7f6318979f56Fc287d76c30847ff",
  "settleTxHash": "0x...",
  "refundTxHash": "0x...",
  "reason": "DIRTY_DATA",
  "createdAt": 1738972800000
}
```

### Response (not found)

```json
{
  "error": "NOT_FOUND",
  "message": "No refund record for this requestId"
}
```

---

## 8. Demo Flow (PPT Narrative)

### Slide A: Normal Payment Path

```
Client → Auth → x402 settle → 200 + settlementTxHash
```

### Slide B: Business Failure with Auto-Refund (highlight)

```
1. Client → GET /sandbox/weather (with payment)
2. Server executes business → detects external data anomaly
3. Handler sets X-Refund-Requested: 1, returns 200 + { ok: false }
4. x402 settles (merchant receives funds)
5. finish callback → guards pass → enqueue refund
6. Async worker → ERC20 transfer → refundTxHash recorded
7. Client calls GET /refunds/:requestId → sees refund_submitted + txHash
8. Open block explorer → verify funds returned to payer
```

### Slide C: Why This Design Is Safe

- Refund only after confirmed settlement (no false refunds)
- Business-explicit trigger (no 5xx auto-refund vulnerability)
- Idempotent by requestId (no duplicate refunds)
- Async execution (no HTTP timeout risk)

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| Refund tx fails | Retry once after 3s; if still fails → `refund_failed` |
| Gas insufficient | tx fails → retry → `refund_failed` with error reason |
| Concurrent same requestId | CAS prevents duplicate; second attempt is no-op |
| finish callback throws | try/catch logs error; response already sent, unaffected |
| x402 settles but finish fails | Refund not queued; discoverable via missing record; manual ops |

---

## 10. Security

| Threat | Mitigation |
|--------|------------|
| Fake refund (client-triggered) | Refund signal is server-side only (`X-Refund-Requested` set by handler, not client) |
| Duplicate refund | requestId idempotency + CAS state transitions |
| Spam / gas drain | Payment rate limiter (facilitator) naturally limits refund frequency |
| Payer address spoofing | Payer from ecrecover (auth-check), not from client header |

---

## 11. Files Changed

### New Files

| File | Purpose |
|------|---------|
| `packages/server/src/middleware/refund-wrapper.ts` | finish callback + guard logic |
| `packages/server/src/refund/refund-store.ts` | In-memory Map + TTL + CAS |
| `packages/server/src/refund/refund-worker.ts` | Async ERC20 transfer execution |
| `packages/server/src/routes/refunds.ts` | `GET /refunds/:requestId` query endpoint |

### Modified Files

| File | Change |
|------|--------|
| `packages/server/src/routes/config.ts` | Add `refund?: RefundPolicy` to RouteConfig |
| `packages/server/src/routes/sandbox.ts` | Demo handler adds refund signal headers |
| `packages/server/src/app.ts` | Register refund wrapper + refund query route |
| `packages/server/src/config.ts` | Add `REFUND_DEFAULT` env var |

### Unchanged

- `@x402/express` source code
- `packages/facilitator`
- `packages/contracts`
- `packages/client` (can optionally add query, not required)
- `packages/chain-config`

---

## 12. Future Work

| Item | Description |
|------|-------------|
| `refund_confirmed` state | Monitor on-chain receipt for confirmation |
| Persistent storage | SQLite / PostgreSQL replacing in-memory Map |
| Escrow contract (Path B) | Payment into escrow; settle/refund two-phase |
| Batch refund | Reduce gas cost via batched transfers |
| Independent rate limiter | Refund-specific frequency limits |
| `close` event handling | Cover client disconnect after settlement |
| Partial refund | `REFUND_MODE=partial` with proportional return |
| Reconciliation | Post-hoc repair for network partitions / duplicate settlements |
| requestId in signature | Bind requestId into signed auth message to prevent tampering |
| Separate refund wallet | Isolate refund funds from merchant operating wallet |

---

## 13. Implementation Status

**Implemented:** 2026-02-08

All files listed in Section 11 have been created/modified. 29 tests pass.
Demo: `GET /sandbox/weather?demo_refund=1` triggers the refund flow.
