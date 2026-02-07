# Conflux x402 Toolkit

A developer toolkit for running x402 payments on Conflux eSpace mainnet with USDT0.

## What is implemented

- End-to-end x402 payment flow on Conflux (`eip155:1030`)
- Custom facilitator service (`verify` / `settle` / `supported`)
- Express API server with protected paid route (`GET /sandbox/weather`)
- Client auto-payment mode (automatic `402 -> sign -> retry`)
- Client manual-payment mode (user confirms before signing)
- Safety controls: allowlist, limits, verify-only switch, circuit breaker

## Monorepo packages

- `packages/chain-config` - chain/token constants and shared types
- `packages/facilitator` - facilitator service
- `packages/server` - protected API server
- `packages/client` - auto and manual payment clients

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

## Notes

- Network: Conflux eSpace Mainnet (`eip155:1030`)
- Token: USDT0
- `VERIFY_ONLY_MODE=true` validates signatures only; no on-chain settlement
- Set `VERIFY_ONLY_MODE=false` to execute real settlement transactions
