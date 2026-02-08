# Conflux x402 Toolkit

A developer toolkit for running x402 payments on Conflux eSpace mainnet with USDT0.

## What is implemented

- End-to-end x402 payment flow on Conflux (`eip155:1030`)
- Custom facilitator service (`verify` / `settle` / `supported`)
- Express API server with protected paid route (`GET /sandbox/weather`)
- Client auto-payment mode (automatic `402 -> sign -> retry`)
- Client manual-payment mode (user confirms before signing)
- Safety controls: rate limits, verify-only switch, circuit breaker
- **Identity gating**: Optional domain-based client authentication with cryptographic request signatures
- **Clean 403/402 separation**: Auth failures (403) happen before the payment layer (402)

## Monorepo packages

- `packages/chain-config` - chain/token constants and shared types
- `packages/facilitator` - facilitator service
- `packages/server` - protected API server
- `packages/client` - auto and manual payment clients
- `packages/contracts` - identity gating smart contracts
- `packages/attestor` - domain verification attestor service
- `packages/identity-cli` - CLI tool for identity registration

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Create and fill environment file:

```bash
cp .env.example .env
```

Required values:

- `FACILITATOR_PRIVATE_KEY` (with `0x` prefix)
- `CLIENT_PRIVATE_KEY` (with `0x` prefix)
- `EVM_ADDRESS` (payee address)

3. Start services:

```bash
pnpm dev:facilitator
pnpm dev:server
```

## Client modes

### Auto mode

```bash
pnpm start:client
```

### Manual mode

```bash
pnpm start:client:manual
```

Manual mode first fetches a `402` response, prints payment requirements, and waits for explicit user confirmation (`yes/no`) before signing and retrying.

## Identity Gating (Optional)

Enable domain-based client authentication to restrict x402 payments to registered identities.

### How it works

1. **Registration**: Clients prove domain ownership via HTTP or DNS verification
2. **Attestation**: Attestor service validates and signs the claim
3. **On-chain**: ZK verifier registers the identity in IdentityRegistry contract
4. **Enforcement**: Server checks identity before the x402 payment layer (clean 403 vs 402 separation)

### Verification Methods

- **HTTP Endpoint** (default): Fast, requires web server - `https://domain.com/verify?address=0x...`
- **DNS TXT Record**: Industry standard, no server needed - `_x402-verify.domain.com TXT "challenge"`

See [DNS Verification Guide](docs/DNS-VERIFICATION.md) for details.

### Quick setup

#### 1. Deploy contracts

```bash
cd packages/contracts
pnpm run deploy --network confluxESpaceMainnet
```

Save the output addresses to `.env`:
```bash
IDENTITY_REGISTRY_ADDRESS=0x...
ZK_VERIFIER_ADDRESS=0x...
```

#### 2. Start attestor service

```bash
pnpm dev:attestor
```

#### 3. Register a client identity

**Option A: Automatic (one command)**

```bash
cd packages/identity-cli
pnpm build

# DNS verification (recommended)
node dist/cli.js register -d yourdomain.com -m dns

# HTTP verification (for testing)
node dist/cli.js register -d yourdomain.com -m http
```

**Option B: Manual (API + CLI submit)**

Useful for production workflows or when you need to review the signature before submitting.

```bash
# Step 1: Get challenge from attestor
curl -X POST http://localhost:3003/challenge \
  -H "Content-Type: application/json" \
  -d '{"address":"0xYourAddress","domain":"yourdomain.com","method":"dns"}'

# Step 2: Add DNS TXT record (or set up HTTP endpoint)
# _x402-verify.yourdomain.com TXT "x402-verify-..."

# Step 3: Get attestation signature
curl -X POST http://localhost:3003/attest \
  -H "Content-Type: application/json" \
  -d '{"address":"0xYourAddress","domain":"yourdomain.com","method":"dns"}'

# Step 4: Submit proof to blockchain
node dist/cli.js submit \
  --signature "0x..." \
  --domain-hash "0x..." \
  --expiry "1773078778"
```

#### 4. Verify registration

```bash
node dist/cli.js check \
  --address 0xYourAddress \
  --registry 0xYourRegistryAddress
```

Should show: ✅ Identity is VALID

#### 5. Enable identity gating

```bash
# In .env (server side)
AUTH_MODE=domain_gate
IDENTITY_REGISTRY_ADDRESS=0xYourRegistryAddress

# In .env (client side)
AUTH_ENABLED=true

# Optional: protect facilitator with API key
FACILITATOR_API_KEY=your-secret-key
```

Restart services:
```bash
pnpm dev:facilitator
pnpm dev:server
```

#### 6. Test the full flow

```bash
# Test with registered client (should succeed)
pnpm start:client

# Test with unregistered client (should fail with 403)
# Change CLIENT_PRIVATE_KEY to an unregistered address
pnpm start:client
```

### CLI Commands Reference

```bash
# Register identity (automatic verification + on-chain submission)
node dist/cli.js register -d domain.com -m dns

# Submit pre-verified attestation (skip verification)
node dist/cli.js submit -s 0xSig -d 0xHash -e timestamp

# Check identity status
node dist/cli.js check -a 0xAddress

# Start local HTTP server for testing
node dist/cli.js serve -c "challenge-code" -p 8080
```

### Documentation

- **Architecture**: `docs/plans/2026-02-08-client-authentication-gating-design.md`
- **DNS Verification Guide**: `docs/DNS-VERIFICATION.md`
- **Deployment Guide**: `docs/DEPLOYMENT-GUIDE.md`
- **Testing Guide**: `examples/test-dns-verification.md`

## Auth Gate (Server-Side)

The server uses an optional auth gate that runs **before** the x402 payment middleware. This ensures clean semantic separation: auth failures return **403 Forbidden** and payment failures return **402 Payment Required**.

### AUTH_MODE=none (default)

No authentication. All clients go straight to the x402 payment flow.

```bash
AUTH_MODE=none
```

### AUTH_MODE=domain_gate

Clients must sign each request with their wallet key. The server recovers the payer address from the signature and checks the on-chain IdentityRegistry.

```bash
# Server
AUTH_MODE=domain_gate
IDENTITY_REGISTRY_ADDRESS=0x...

# Client
AUTH_ENABLED=true
```

**Request signature protocol:** The client signs `keccak256("X402-AUTH" || chainId || host || method || path || bodyHash || nonce || expiry)` using `personal_sign`. The server recovers the payer address (never trusts a header value) and checks `IdentityRegistry.isValid(payer)`.

### Facilitator API Key

The facilitator can be protected with a shared API key to prevent direct access bypass:

```bash
FACILITATOR_API_KEY=your-secret-key   # Set in both server and facilitator .env
```

When set, the facilitator rejects requests without a valid `X-API-Key` header (except `/health`).

## Configuration Layers

### Auth Layer (Who can access?)
- `AUTH_MODE` on the server controls **403 Forbidden** responses
- Runs before the payment layer

### Settlement Layer (Execute transactions?)
- `VERIFY_ONLY_MODE` (independent control)
- `true` = signature validation only, `false` = real on-chain settlement

## Notes

- Network: Conflux eSpace Mainnet (`eip155:1030`)
- Token: USDT0
- Auth failures return **403 Forbidden** (before payment layer)
- Payment failures return **402 Payment Required** (from x402 middleware)
- See `docs/plans/2026-02-08-server-side-auth-gate-design.md` for full architecture details
