# MovieMemo x402 Demo

Agent-to-agent micropayment demo showcasing x402 protocol on Conflux eSpace.

## Architecture

```
User (Telegram/Discord)
  │
  ▼
OpenClaw (Claude Code Agent)
  │  invokes x402_pay_fetch MCP tool
  ▼
x402 MCP Server (local)
  │  auto-handles 402 payment
  ▼
MovieMemo Server (Express + x402)
  │  verify/settle
  ▼
Facilitator  →  Conflux eSpace (USDT0)
```

## Quick Start

### 1. Setup Environment

```bash
cp .env.example .env
# Edit .env and fill in:
# - FACILITATOR_PRIVATE_KEY (needs CFX for gas)
# - EVM_ADDRESS (receives USDT0 payments)
# - TMDB_API_KEY (get from https://www.themoviedb.org/settings/api)
# - X402_PRIVATE_KEY (for MCP client, needs USDT0 balance)
```

### 2. Install Dependencies

```bash
pnpm install
pnpm build
```

### 3. Start Services

**Terminal 1: Facilitator**
```bash
pnpm dev:facilitator
```

**Terminal 2: MovieMemo Server**
```bash
pnpm dev:moviememo
```

### 4. Test MovieMemo API

```bash
node test-moviememo.mjs
```

Expected output:
- Health check passes
- 3 endpoints return 402 Payment Required (if PAYMENT_ENABLED=true)
- Or return movie data (if PAYMENT_ENABLED=false for testing)

## MovieMemo API Endpoints

All paid endpoints cost **0.001 USDT0** per call.

### 1. Movie Info
```bash
POST /api/movie-info
Body: { "query": "Inception" }
```

Returns: director, cast, rating, box office, plot, genres

### 2. Career Trends
```bash
POST /api/career-trends
Body: { "query": "Christopher Nolan", "type": "director" }
```

Returns: total movies, average rating, top 3 films, rating trend analysis

### 3. Soundtrack
```bash
POST /api/soundtrack
Body: { "query": "Inception" }
```

Returns: soundtrack tracks with YouTube Music search links

## MCP Server for OpenClaw

### Install in OpenClaw

Add to your MCP configuration (`~/.config/claude-code/mcp.json` or similar):

```json
{
  "mcpServers": {
    "x402-payment": {
      "command": "npx",
      "args": ["tsx", "/path/to/conflux-x402-toolkit/packages/mcp-server/src/index.ts"],
      "env": {
        "X402_PRIVATE_KEY": "0x...",
        "X402_RPC_URL": "https://evm.confluxrpc.com",
        "X402_MAX_PAYMENT_PER_CALL": "0.10",
        "X402_MAX_DAILY_SPEND": "5.0"
      }
    }
  }
}
```

### MCP Tools Available

1. **x402_pay_fetch** - Make paid API calls automatically
2. **x402_check_balance** - Check USDT0 wallet balance
3. **x402_payment_history** - View recent payments

### Example OpenClaw Conversation

```
User: "What are the filming locations for Inception?"

OpenClaw: [Automatically calls x402_pay_fetch with MovieMemo API]
          [Payment of 0.001 USDT0 is handled transparently]

          "Inception was filmed at:
          - Paris, France (dream sequences)
          - Los Angeles, USA (hotel corridor)
          - Calgary, Canada (snow fortress)
          ..."
```

## Security Features

✅ **URL Validation** - HTTPS-only, blocks private IPs
✅ **Payment Limits** - Per-call and daily spending caps
✅ **Input Validation** - Zod schemas for all inputs
✅ **Real Payment Tracking** - Extracts actual tx hashes from x402 headers

## Development

### Run Tests
```bash
# Start services first, then:
node test-moviememo.mjs
```

### Build
```bash
pnpm build
```

### Lint
```bash
pnpm lint
```

## Troubleshooting

**"TMDB_API_KEY not configured"**
- Get a free API key from https://www.themoviedb.org/settings/api
- Add to `.env`: `TMDB_API_KEY=your_key_here`

**"Daily spending limit reached"**
- The MCP server tracks daily spending in memory
- Restart the MCP server to reset the counter
- Or increase `X402_MAX_DAILY_SPEND` in config

**"Blocked hostname: requests to localhost"**
- The MCP server blocks localhost for security
- Use `https://` URLs pointing to deployed services
- For local testing, temporarily disable payment: `PAYMENT_ENABLED=false`

## License

MIT
