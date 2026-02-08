# Chain Discovery + Bazaar: Minimal Closed Loop

**Date:** 2026-02-08
**Scope:** PoC — on-chain agent registry, bazaar discovery, buyer agent auto-discovery + pay
**Principle:** Agent discovers services from chain events + bazaar catalog, pays via x402 402→pay→retry

---

## 1. Components

| Component | Location | What it does |
|-----------|----------|-------------|
| AgentRegistry contract | `packages/contracts/contracts/AgentRegistry.sol` | On-chain "capability → endpoint" registry |
| Seller (chart routes) | `examples/sandbox` (added routes) | `/chart/render` behind x402 + `/.well-known/x402-bazaar.json` metadata |
| Bazaar discovery | `packages/facilitator` (added route) | `GET /discovery/resources` — reads chain + fetches endpoint metadata |
| Buyer Agent | `tools/buyer-agent` (new package) | Event subscription → bazaar query → 402→pay→retry |

**Not doing:** off-chain indexer, healthcheck, reputation, frontend, complex ranking.

---

## 2. Chain Registry Contract

### Storage

```solidity
struct Agent {
    address owner;
    address wallet;
    address asset;        // e.g. USDT0 address
    string  endpoint;     // https://...
    uint256 price;        // raw token units (1000 = 0.001 USDT0)
    bool    active;
}

mapping(uint256 => Agent) public agents;
mapping(uint256 => mapping(bytes32 => bool)) public hasCapability;
uint256 public nextAgentId;
```

No on-chain capability index arrays. Discovery is event-driven.

### Write Functions

- `registerAgent(string endpoint, address asset, uint256 price, bytes32[] initialCaps) → uint256`
  - owner = wallet = msg.sender
  - `require(bytes(endpoint).length > 0 && bytes(endpoint).length <= 200)`
  - Emits `AgentRegistered` + `AgentCapabilitySet(id, cap, true)` per cap
- `enableCapabilities(uint256 agentId, bytes32[] caps)` — onlyOwner
- `disableCapabilities(uint256 agentId, bytes32[] caps)` — onlyOwner
- `deactivate(uint256 agentId)` — onlyOwner, emits `AgentDeactivated`

### Read Functions

- `getAgent(uint256 id) → (owner, wallet, asset, endpoint, price, active)`
- `isCapable(uint256 id, bytes32 capId) → bool`

### Events

- `AgentRegistered(uint256 indexed agentId, address indexed wallet, address asset, string endpoint, uint256 price)`
- `AgentCapabilitySet(uint256 indexed agentId, bytes32 indexed capabilityId, bool enabled)`
- `AgentDeactivated(uint256 indexed agentId)`

### Deploy

Hardhat script `scripts/deploy-registry.ts` → Conflux eSpace mainnet (1030).

---

## 3. Seller: Chart Routes + Bazaar Metadata

Added to existing `examples/sandbox`.

### New Route: `GET /chart/render`

Protected by x402 middleware (same as `/sandbox/weather`).

Query params: `type=bar|line|pie`, `data=<json>` (or sensible defaults for demo).

Returns JSON: `{ chartType, data, renderedAt, svg?: "..." }`.

For PoC, returns a mock chart payload (no real SVG rendering needed).

### New Endpoint: `GET /.well-known/x402-bazaar.json`

**Not** behind x402 — public metadata endpoint.

Returns:

```json
{
  "name": "Chart Agent",
  "description": "Generates charts from structured data",
  "capabilities": ["chart-generation"],
  "routes": [
    {
      "path": "/chart/render",
      "method": "GET",
      "description": "Render a chart from input data",
      "input": {
        "type": "object",
        "properties": {
          "type": { "enum": ["bar", "line", "pie"] },
          "data": { "type": "object" }
        }
      },
      "output": {
        "type": "object",
        "properties": {
          "chartType": { "type": "string" },
          "data": { "type": "object" },
          "renderedAt": { "type": "string" }
        }
      }
    }
  ]
}
```

### Route Config

Add `/chart/render` to `routes/config.ts` with price `$0.001` (1000 raw units), same scheme as weather.

### Registration Script

`scripts/register-chart-agent.ts` — calls `AgentRegistry.registerAgent()` on mainnet with:
- endpoint = server URL
- asset = USDT0 address
- price = 1000
- caps = `[keccak256("chart-generation")]`

---

## 4. Bazaar: Facilitator Discovery Route

Added to existing `packages/facilitator`.

### New Route: `GET /discovery/resources`

Query params: `type=http` (only type supported), `limit`, `offset`, `capability` (optional filter).

Logic:
1. Scan chain: iterate `agentId` 0..nextAgentId-1, call `getAgent()` + optionally `isCapable()`
2. Filter: only `active === true`, match `capability` if provided
3. For each agent, fetch `{endpoint}/.well-known/x402-bazaar.json` (cached 30s in-memory)
4. Assemble bazaar items

Response:

```json
{
  "resources": [
    {
      "agentId": 0,
      "name": "Chart Agent",
      "description": "...",
      "endpoint": "https://...",
      "capabilities": ["chart-generation"],
      "accepts": {
        "scheme": "exact",
        "network": "eip155:1030",
        "asset": "0xaf37...",
        "amount": "1000",
        "payTo": "0x..."
      },
      "routes": [ ... ],
      "metadata": { ... }
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Config Addition

Add `AGENT_REGISTRY_ADDRESS` to facilitator config (address of deployed AgentRegistry).

---

## 5. Buyer Agent

New package: `tools/buyer-agent`.

### Discovery

Two modes (both demonstrated in the demo script):

**Mode 1 — Event subscription (primary):**
- Connect WebSocket to `wss://evm.confluxrpc.com/ws` (or fallback: poll via HTTP)
- Subscribe to `AgentRegistered`, `AgentCapabilitySet`, `AgentDeactivated`
- Maintain in-memory `Map<agentId, AgentInfo>`
- On startup: backfill by scanning `agentId` 0..nextAgentId-1

**Mode 2 — Bazaar query (secondary):**
- `GET facilitator/discovery/resources?capability=chart-generation`
- Parse response, extract endpoint + accepts + routes

### Execution Flow

```
1. Discover agents with capability "chart-generation"
2. Select first active agent (no ranking for PoC)
3. fetch(endpoint + /chart/render?type=bar) → 402
4. x402 client auto-pays → retry → 200
5. Print result
```

### Config

```
BUYER_PRIVATE_KEY=0x...         (required)
FACILITATOR_URL=http://...      (required)
AGENT_REGISTRY_ADDRESS=0x...    (required)
RPC_URL                         (default: https://evm.confluxrpc.com)
```

### Package Structure

```
tools/buyer-agent/
  src/
    index.ts              # Main demo script
    config.ts             # Env config
    discovery/
      chain-scanner.ts    # Startup scan + event subscription
      bazaar-client.ts    # GET /discovery/resources wrapper
    agent.ts              # Select agent + pay-and-fetch
  package.json
  tsconfig.json
```

---

## 6. Demo Flow

```
Terminal 1: pnpm dev:facilitator
Terminal 2: pnpm dev:sandbox
Terminal 3: pnpm start:buyer-agent

Buyer Agent output:
  [scan] Scanning registry... found 0 agents
  [register] Registering Chart Agent on-chain... tx: 0xabc...
  [event] AgentRegistered: id=0 endpoint=http://localhost:4021 price=1000
  [discover] Querying bazaar: GET /discovery/resources?capability=chart-generation
  [discover] Found: Chart Agent (chart-generation) price=0.001 USDT0
  [call] GET http://localhost:4021/chart/render?type=bar → 402 Payment Required
  [pay] Signing payment... amount=1000 USDT0
  [retry] Retrying with payment header...
  [result] 200 OK: { chartType: "bar", data: {...}, renderedAt: "..." }
```

For the demo, `buyer-agent` also runs the `registerAgent()` tx itself (so you don't need a separate registration step).

---

## 7. Out of Scope (Future Work)

- Bazaar catalog from payment extraction (currently: chain registry + endpoint metadata)
- Payment is real x402 exact scheme (not mock) — using existing infrastructure
- Ranking / healthcheck / reputation
- Off-chain indexer (Subgraph, etc.)
- Frontend visualization
- Multiple networks / cross-chain discovery
- Facilitator fee extraction from discovery

---

## 8. File Changes Summary

| Package | Files Added/Modified |
|---------|---------------------|
| `packages/contracts` | `contracts/AgentRegistry.sol`, `scripts/deploy-registry.ts`, `test/AgentRegistry.test.ts` |
| `examples/sandbox` | `src/routes/chart.ts`, `src/routes/well-known.ts`, `src/routes/config.ts` (mod), `src/app.ts` (mod), `scripts/register-chart-agent.ts` |
| `packages/facilitator` | `src/discovery/bazaar.ts`, `src/discovery/chain-reader.ts`, `src/discovery/metadata-cache.ts`, `src/index.ts` (mod), `src/config.ts` (mod) |
| `tools/buyer-agent` | New package — `package.json`, `tsconfig.json`, `src/index.ts`, `src/config.ts`, `src/discovery/chain-scanner.ts`, `src/discovery/bazaar-client.ts`, `src/agent.ts` |
| root | `package.json` (add `start:buyer-agent` script), `pnpm-workspace.yaml` (already includes `packages/*`) |
