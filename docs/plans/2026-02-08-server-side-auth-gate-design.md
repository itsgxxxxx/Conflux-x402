# Server-Side Auth Gate Design

**Date**: 2026-02-08
**Scope**: Move identity authorization from facilitator to server
**Goal**: Clean 403 vs 402 semantic separation with cryptographic payer binding

## Problem

Authorization checks currently live inside the facilitator's `onBeforeVerify` hook. The x402 library wraps any facilitator failure into a 402 response on the client side, which means 403 (Forbidden / unauthorized) is indistinguishable from 402 (Payment Required). This is a responsibility boundary error: auth must happen before the payment protocol starts.

The existing `auth-check.ts` middleware in the server is a workaround that pre-calls the facilitator's `/verify` endpoint with dummy payment requirements. This is fragile and semantically wrong.

## Solution

Move identity-based authorization to the server layer, before x402 middleware, using cryptographic request signatures for payer binding. The facilitator is protected by a shared API key and only handles payment logic.

### Auth Modes

The identity gate is optional and policy-driven. Merchants can run pure x402 without any authentication, or enable domain-gated access.

| Mode | Behavior | Required Headers |
|------|----------|-----------------|
| `none` (default) | No auth, pure x402 | None |
| `domain_gate` | Signature + IdentityRegistry check before x402 | `X-Auth-Signature`, `X-Auth-Nonce`, `X-Auth-Expiry` |

Configuration:

```
AUTH_MODE=none           # or "domain_gate"
IDENTITY_REGISTRY_ADDRESS=0x...  # required when AUTH_MODE=domain_gate
```

## Request Signature Protocol

### Canonical Signed Message

```
message = keccak256(
  "X402-AUTH"        // domain separator (prevents cross-protocol replay)
  || chainId         // prevents cross-chain replay (1030 for Conflux eSpace)
  || host            // prevents cross-domain replay
  || method          // GET, POST, etc.
  || path            // /sandbox/weather
  || bodyHash        // keccak256(body) for POST; 0x0 for GET/HEAD
  || nonce           // unique per request (UUID)
  || expiry          // unix timestamp, e.g. issuedAt + 30s
)

sig = personal_sign(payer_sk, message)
```

### Request Headers

```
X-Payer: 0xABC...           # Optional, for debugging/logging only
X-Auth-Signature: 0xSIG...  # personal_sign output
X-Auth-Nonce: uuid-v4       # unique per request
X-Auth-Expiry: 1707350430   # absolute expiry timestamp
```

### Server Verification Logic

```
1. payer = ecrecover(sig, message)     // payer derived from sig, NOT from header
2. Check: expiry > now                 // not expired
3. Check: expiry - now < MAX_WINDOW    // not too far in future (60s)
4. Check: nonce not seen               // replay protection (TTL = expiry - now)
5. Check: IdentityRegistry.isValid(payer)  // on-chain identity
6. Pass → next()  |  Fail → 403
```

`X-Payer` header is informational only. The authoritative payer is always the recovered address.

### Nonce Storage (PoC)

In-memory `Map<string, number>` with TTL = expiry - now. Expired nonces are auto-cleaned on a 60s interval. No persistent storage needed for PoC.

## Request Flow

```
Client                          Server                         Facilitator
  |                               |                               |
  | GET /sandbox/weather          |                               |
  | X-Auth-Signature: 0xSIG      |                               |
  | X-Auth-Nonce: abc123          |                               |
  | X-Auth-Expiry: 1707350430    |                               |
  |------------------------------>|                               |
  |                               |                               |
  |                    +----------+                               |
  |                    | 1. recover payer from sig                 |
  |                    | 2. check expiry + nonce                  |
  |                    | 3. IdentityRegistry.isValid(payer)       |
  |                    +----------+                               |
  |                               |                               |
  |  Fail -> 403 Forbidden        |                               |
  |<------------------------------|                               |
  |                               |                               |
  |  Pass -> x402 middleware      |                               |
  |                               |--- verify/settle ----------->|
  |                               |   (with X-API-Key header)     |
  |  402 / 200 (normal x402)     |                               |
  |<------------------------------|                               |
```

## Component Changes

### Server (`packages/server`)

**Rewrite `middleware/auth-check.ts`:**
- Remove the hacky pre-call to facilitator `/verify`
- Implement: recover payer from signature, check expiry/nonce, query IdentityRegistry
- Use viem `recoverMessageAddress` + `readContract` (viem already a dependency)
- Nonce store: in-memory Map with TTL cleanup

**Add `middleware/nonce-store.ts`:**
- In-memory nonce dedup with auto-expiry
- `has(nonce)` / `add(nonce, ttl)` / `cleanup()`

**Update `config.ts`:**
- Add `authMode: "none" | "domain_gate"`
- Add `identityRegistryAddress` (for domain_gate mode)
- Add `facilitatorApiKey`
- Add `rpcUrl` (for on-chain reads)
- Add `chainId` (for signature domain)
- Remove dependency on facilitator for auth decisions

**Update `app.ts`:**
- Replace `createAuthCheckMiddleware` with new auth gate
- Pass viem public client to auth middleware

**Update `middleware/identity-gate.ts`:**
- Currently a pass-through stub. Replace with actual implementation or remove in favor of auth-check rewrite.

### Facilitator (`packages/facilitator`)

**Add API key middleware:**
- Validate `X-API-Key` header on `/verify`, `/settle`, `/supported`
- Skip for `/health`
- Reject with 401 if missing/wrong

**Simplify `onBeforeVerify`:**
- Remove identity check (`checkIdentity` call) and allowlist logic
- Keep: rate limits, circuit breaker, idempotency
- Add: optional observe-only identity logging (defense-in-depth, warn only, never reject)

**Update `config.ts`:**
- Remove `requireIdentity`, `allowedPayerAddresses` from facilitator config
- Add `facilitatorApiKey`

### Client (`packages/client`)

**Add `sign-request.ts`:**
- Build canonical message from request details
- Sign with payer private key via viem `signMessage`
- Return headers object: `{ "X-Auth-Signature", "X-Auth-Nonce", "X-Auth-Expiry", "X-Payer" }`

**Update `config.ts`:**
- Add `authEnabled: boolean` (default false)

**Update `pay-and-fetch.ts`:**
- When `authEnabled`, attach auth headers to all requests
- Works with both auto and manual modes

**Update `manual.ts`:**
- Attach auth headers to both the initial request and the paid retry

### .env.example

- Move `REQUIRE_IDENTITY` / `ALLOWED_PAYER_ADDRESSES` out of facilitator section
- Add `AUTH_MODE` to server section
- Add `FACILITATOR_API_KEY` to both server and facilitator sections
- Add `AUTH_ENABLED` to client section

## Implementation Tasks

### Task 1: Server auth gate middleware
- Rewrite `packages/server/src/middleware/auth-check.ts`
- Add `packages/server/src/middleware/nonce-store.ts`
- Update `packages/server/src/config.ts` with new auth config fields
- Update `packages/server/src/app.ts` to wire up new middleware
- Remove unused `middleware/identity-gate.ts` stub

### Task 2: Facilitator API key + cleanup
- Add API key validation middleware to facilitator
- Remove identity check and allowlist logic from `onBeforeVerify`
- Add observe-only identity logging (warn, never reject)
- Update `packages/facilitator/src/config.ts`

### Task 3: Client request signing
- Add `packages/client/src/sign-request.ts`
- Update `packages/client/src/config.ts` with `authEnabled`
- Update `packages/client/src/pay-and-fetch.ts` to attach auth headers
- Update `packages/client/src/manual.ts` to attach auth headers

### Task 4: Configuration + documentation
- Update `.env.example` with new config structure
- Update `README.md` authorization section

### Task 5: Tests
- Server auth middleware unit tests (signature verification, nonce replay, expiry)
- Facilitator API key middleware tests
- Client request signing tests

## Security Properties

- **No payer forgery**: payer address is always recovered from signature, never trusted from header
- **No replay**: nonce dedup + expiry window
- **No cross-chain replay**: chainId in signed message
- **No cross-domain replay**: host in signed message
- **No request tampering (POST)**: bodyHash in signed message
- **Facilitator protected**: API key prevents direct access bypass
- **Optional**: merchants who don't need auth run with `AUTH_MODE=none`, zero overhead

## Backward Compatibility

- `AUTH_MODE=none` (default) means zero changes for existing clients
- Existing `REQUIRE_IDENTITY` / `ALLOWED_PAYER_ADDRESSES` env vars will be removed from facilitator
- Client `AUTH_ENABLED=false` (default) means no auth headers sent
