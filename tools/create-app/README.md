# @conflux-x402/create-app

Scaffolding tool for Conflux eSpace x402 payment applications.

## Usage

```bash
# Using npx (recommended)
npx create-x402-app

# Using npm
npm create x402-app

# Using pnpm
pnpm create x402-app
```

## What it does

The CLI will guide you through an interactive setup process:

1. **Project name**: Choose a name for your project (default: `my-x402-app`)
2. **Template preset**:
   - `core`: Facilitator + Sandbox + Client + Middleware
   - `core+identity`: Core + Attestor + Contracts + Identity CLI
3. **Network**: Choose between testnet (Chain ID: 71) or mainnet (Chain ID: 1030)

The tool will:
- Generate a complete project structure
- Configure network settings based on your selection
- Initialize a git repository
- Install dependencies with pnpm
- Print next steps

## Requirements

- **Node.js**: >= 18.0.0
- **pnpm**: Required (the generated project uses pnpm workspaces and `workspace:*` protocol)

## Template Variables

The following variables are automatically configured based on your selections:

- `{{PROJECT_NAME}}`: Your project name
- `{{CHAIN_ID}}`: Network chain ID (71 for testnet, 1030 for mainnet)
- `{{RPC_URL}}`: Network RPC URL
- `{{NETWORK_CAIP2}}`: CAIP-2 network identifier
- `{{AUTH_MODE}}`: Authentication mode (`none` or `domain_gate`)
- `{{AUTH_ENABLED}}`: Whether authentication is enabled

## Development

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Test locally
node dist/index.js
```

## Project Structure

### Core Template

```
my-x402-app/
├── packages/
│   ├── chain-config/       # Chain configuration
│   ├── facilitator/        # Payment facilitator service
│   └── express-middleware/ # Express middleware for x402
├── tools/
│   └── client/             # CLI client for testing
├── examples/
│   └── sandbox/            # Example API server
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### Core + Identity Template

Includes all core packages plus:

```
packages/
├── attestor/               # Identity attestation service
├── contracts/              # Smart contracts (IdentityRegistry, AgentRegistry, ZKVerifier)
└── identity-cli/           # CLI for identity management
```

## Next Steps

After creating your project:

```bash
cd my-x402-app
cp .env.example .env
# Edit .env with your configuration

pnpm build
pnpm dev:facilitator
# In another terminal:
pnpm dev:sandbox
```

## License

MIT
