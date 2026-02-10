# Conflux x402 Toolkit

A developer toolkit for running x402 payments on Conflux eSpace mainnet with USDT0.

## What is implemented

- End-to-end x402 payment flow on Conflux (`eip155:1030`)
- Custom facilitator service (`/verify`, `/settle`, `/supported`)
- Example paid APIs (`examples/sandbox`, `examples/moviememo`)
- MCP payment tool server (`tools/mcp-server`)
- Auto/manual client payment flows (`tools/client`)
- Optional auth gate (wallet signature + IdentityRegistry check)
- Clean `403` (auth) before `402` (payment)
- Optional async refund pipeline with status query endpoint

## Repository layout

- `packages/chain-config`: shared chain/token constants and types
- `packages/express-middleware`: reusable x402 express middleware
- `packages/facilitator`: facilitator service
- `packages/contracts`: identity-gating contracts
- `packages/attestor`: domain attestation service
- `packages/identity-cli`: identity registration/check CLI
- `examples/sandbox`: sandbox paid API with auth gate + refund flow
- `examples/moviememo`: MovieMemo paid API demo
- `tools/client`: x402 payment client
- `tools/mcp-server`: MCP server with x402 payment tools
- `tools/buyer-agent`: on-chain discovery + bazaar query demo client
- `tools/create-app`: scaffolding CLI for creating new x402 projects

## Create a new x402 project

Use the scaffolding tool to quickly bootstrap a new x402 payment application:

```bash
# From this repository
pnpm start:create-app

# Or using npx (when published)
npx create-x402-app
```

The CLI will guide you through:
1. Project name selection
2. Template preset (core / core+identity)
3. Network selection (testnet / mainnet)

Generated project includes:
- Facilitator service
- Express middleware
- Client library
- Sandbox example
- Optional: Identity contracts + attestor + CLI

See `tools/create-app/README.md` for details.

## Quick start

```bash
pnpm install
cp .env.example .env
```

Required minimum values:

- `FACILITATOR_PRIVATE_KEY`
- `CLIENT_PRIVATE_KEY`
- `EVM_ADDRESS`

Start core services:

```bash
pnpm dev:facilitator
pnpm dev:sandbox
```

Client:

```bash
pnpm start:client
pnpm start:client:manual
```

## Identity gating (optional)

1. Deploy contracts in `packages/contracts`.
2. Start attestor: `pnpm dev:attestor`.
3. Register identity with `packages/identity-cli`.
4. Enable:

```bash
AUTH_MODE=domain_gate
IDENTITY_REGISTRY_ADDRESS=0x...
AUTH_ENABLED=true
```

References:

- `docs/plans/2026-02-08-client-authentication-gating-design.md`
- `docs/plans/2026-02-08-server-side-auth-gate-design.md`
- `docs/DNS-VERIFICATION.md`

## Refund flow (optional)

Enable defaults in `.env`:

```bash
REFUND_DEFAULT=on
SERVER_PRIVATE_KEY=0x...
```

Query refund record:

```bash
GET /refunds/:requestId
```

References:

- `docs/plans/2026-02-08-async-refund-design.md`
- `docs/plans/2026-02-08-async-refund-impl.md`

## Chain discovery + bazaar (optional)

1. Deploy registry:

```bash
pnpm --filter @conflux-x402/contracts deploy:registry --network confluxESpaceMainnet
```

2. Register agent:

```bash
pnpm --filter @conflux-x402/registry-cli start
```

Required env:
`AGENT_REGISTRY_ADDRESS`, `AGENT_ENDPOINT`, `AGENT_CAPABILITIES`, `AGENT_PRICE`, `EVM_PRIVATE_KEY`

3. Verify:
`https://<your-agent-domain>/.well-known/x402-bazaar.json`

## Notes

- `dev:server` is kept as an alias to `dev:sandbox` for compatibility.
- `VERIFY_ONLY_MODE=true` means no on-chain settlement execution.
