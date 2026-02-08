# Implementation Plan: Chain Discovery + Bazaar

**Design:** `2026-02-08-chain-discovery-bazaar-design.md`
**Branch:** `feat/chain-discovery-bazaar`
**Worktree:** `/Users/efan404/Codes/web3/Conflux-x402--chain-discovery-bazaar`

---

## Step 1: AgentRegistry Contract

**Files:**
- `packages/contracts/contracts/AgentRegistry.sol`
- `packages/contracts/test/AgentRegistry.test.ts`

**Tasks:**
1. Write `AgentRegistry.sol` with Agent struct, registerAgent, enableCapabilities, disableCapabilities, deactivate, getAgent, isCapable
2. Write tests: register, getAgent, isCapable, enable/disable capabilities, deactivate, only-owner guards, endpoint length validation
3. Run `pnpm test:contracts`

**Done when:** All tests pass.

---

## Step 2: Deploy Script + ABI Export

**Files:**
- `packages/contracts/scripts/deploy-registry.ts`

**Tasks:**
1. Write Hardhat deploy script targeting `confluxESpace` network
2. Compile contracts to generate ABI/typechain
3. Note: actual deployment will be done during integration, not during dev

**Done when:** `npx hardhat compile` succeeds, deploy script is syntactically valid.

---

## Step 3: Seller — Chart Route + Well-Known Metadata

**Files:**
- `packages/server/src/routes/chart.ts`
- `packages/server/src/routes/well-known.ts`
- `packages/server/src/routes/config.ts` (modify)
- `packages/server/src/app.ts` (modify)

**Tasks:**
1. Add chart route handler returning mock chart JSON
2. Add `/.well-known/x402-bazaar.json` route (public, no auth/payment)
3. Add `/chart/render` to route config with price $0.001
4. Wire both routes into app.ts

**Done when:** `pnpm dev:server` starts, `GET /.well-known/x402-bazaar.json` returns metadata, `GET /chart/render` returns 402 (when payment enabled).

---

## Step 4: Facilitator — Bazaar Discovery Route

**Files:**
- `packages/facilitator/src/discovery/chain-reader.ts`
- `packages/facilitator/src/discovery/metadata-cache.ts`
- `packages/facilitator/src/discovery/bazaar.ts`
- `packages/facilitator/src/config.ts` (modify)
- `packages/facilitator/src/index.ts` (modify)

**Tasks:**
1. Add `AGENT_REGISTRY_ADDRESS` to facilitator config
2. Write chain-reader: scan agents from registry contract via viem publicClient
3. Write metadata-cache: fetch + cache `/.well-known/x402-bazaar.json` with 30s TTL
4. Write bazaar route handler: scan chain → filter → fetch metadata → assemble response
5. Wire `GET /discovery/resources` into facilitator index.ts

**Done when:** `pnpm dev:facilitator` starts, `GET /discovery/resources` returns (empty) resources array without error.

---

## Step 5: Buyer Agent Package

**Files:**
- `packages/buyer-agent/package.json`
- `packages/buyer-agent/tsconfig.json`
- `packages/buyer-agent/src/config.ts`
- `packages/buyer-agent/src/discovery/chain-scanner.ts`
- `packages/buyer-agent/src/discovery/bazaar-client.ts`
- `packages/buyer-agent/src/agent.ts`
- `packages/buyer-agent/src/index.ts`
- Root `package.json` (add `start:buyer-agent` script)

**Tasks:**
1. Create package.json with dependencies (viem, @x402/client, @x402/evm, @conflux-x402/chain-config)
2. Create tsconfig.json extending root config
3. Write config.ts: BUYER_PRIVATE_KEY, FACILITATOR_URL, AGENT_REGISTRY_ADDRESS, RPC_URL
4. Write chain-scanner.ts: startup scan (iterate agentIds) + event subscription (watchContractEvent)
5. Write bazaar-client.ts: GET /discovery/resources wrapper
6. Write agent.ts: select agent + createPaymentFetch + call endpoint
7. Write index.ts: demo script orchestrating discover → query bazaar → call → pay → print
8. Add `start:buyer-agent` script to root package.json
9. `pnpm install` to link workspace

**Done when:** Package compiles, `pnpm start:buyer-agent` runs (will fail at runtime without deployed contract, but no compile errors).

---

## Step 6: Registration Script

**Files:**
- `packages/server/scripts/register-chart-agent.ts`

**Tasks:**
1. Write script that calls `AgentRegistry.registerAgent()` with server endpoint, USDT0 address, price 1000, capability `keccak256("chart-generation")`
2. Uses server's EVM_ADDRESS private key or a dedicated key

**Done when:** Script compiles, ready to run against mainnet after contract deployment.

---

## Step 7: Integration Test (Manual)

1. Deploy AgentRegistry to mainnet: `npx hardhat run scripts/deploy-registry.ts --network confluxESpace`
2. Record deployed address, set in facilitator + buyer-agent .env
3. Start facilitator: `pnpm dev:facilitator`
4. Start server: `pnpm dev:server`
5. Run registration: `npx ts-node packages/server/scripts/register-chart-agent.ts`
6. Run buyer agent: `pnpm start:buyer-agent`
7. Verify full flow: scan → event → bazaar → 402 → pay → 200
