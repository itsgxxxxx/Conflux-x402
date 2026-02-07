# Conflux x402 Toolkit

A developer toolkit for running x402 payments on Conflux eSpace mainnet with USDT0.

## What is implemented

- End-to-end x402 payment flow on Conflux (`eip155:1030`)
- Custom facilitator service (`verify` / `settle` / `supported`)
- Express API server with protected paid route (`GET /sandbox/weather`)
- Client auto-payment mode (automatic `402 -> sign -> retry`)
- Client manual-payment mode (user confirms before signing)
- Safety controls: allowlist, limits, verify-only switch, circuit breaker
- **Identity gating**: Domain-based client authentication using ZK proofs (optional)

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

1. **Registration**: Clients prove domain ownership via HTTP verification
2. **Attestation**: Attestor service validates and signs the claim
3. **On-chain**: ZK verifier registers the identity in IdentityRegistry contract
4. **Enforcement**: Facilitator checks identity before processing payments

### Quick setup

1. Deploy contracts:

```bash
cd packages/contracts
pnpm run deploy --network confluxESpace
```

2. Start attestor service:

```bash
pnpm dev:attestor
```

3. Register a client identity:

```bash
cd packages/identity-cli
pnpm build
node dist/cli.js register --domain example.com
```

4. Enable identity gating in facilitator:

```bash
# In .env
REQUIRE_IDENTITY=true
IDENTITY_REGISTRY_ADDRESS=0x...  # From deployment
```

See `docs/plans/2026-02-08-client-authentication-gating-design.md` for architecture details.

## Notes

- Network: Conflux eSpace Mainnet (`eip155:1030`)
- Token: USDT0
- `VERIFY_ONLY_MODE=true` validates signatures only; no on-chain settlement
- Set `VERIFY_ONLY_MODE=false` to execute real settlement transactions
- Identity gating is **optional** and disabled by default
