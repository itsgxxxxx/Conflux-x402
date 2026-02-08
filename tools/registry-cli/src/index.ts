import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { confluxESpace, USDT0_MAINNET } from '@conflux-x402/chain-config'

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')
dotenv.config({ path: envPath })

const EnvSchema = z.object({
  AGENT_REGISTRY_ADDRESS: z.string().startsWith('0x'),
  EVM_PRIVATE_KEY: z.string().startsWith('0x').optional(),
  SERVER_PRIVATE_KEY: z.string().startsWith('0x').optional(),
  AGENT_ENDPOINT: z.string().url(),
  AGENT_CAPABILITIES: z.string().default('moviememo'),
  AGENT_PRICE: z.coerce.number().default(0.001),
  AGENT_ASSET: z.string().startsWith('0x').optional(),
  RPC_URL: z.string().url().default('https://evm.confluxrpc.com'),
})

const AGENT_REGISTRY_ABI = [
  {
    name: 'registerAgent',
    type: 'function',
    inputs: [
      { name: 'endpoint', type: 'string' },
      { name: 'asset', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'initialCaps', type: 'bytes32[]' },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const

function normalizeCapabilities(raw: string): string[] {
  return raw
    .split(',')
    .map((cap) => cap.trim())
    .filter(Boolean)
}

function toRawPrice(amount: number): bigint {
  const scaled = Math.round(amount * 1_000_000)
  return BigInt(scaled)
}

async function checkBazaarMetadata(endpoint: string): Promise<void> {
  const url = `${endpoint.replace(/\/$/, '')}/.well-known/x402-bazaar.json`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) {
      console.warn(`[registry-cli] bazaar metadata not reachable: ${response.status} ${url}`)
      return
    }
    console.log('[registry-cli] bazaar metadata OK:', url)
  } catch (error) {
    console.warn(
      '[registry-cli] bazaar metadata fetch failed:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

async function main() {
  const env = EnvSchema.parse({
    AGENT_REGISTRY_ADDRESS: process.env.AGENT_REGISTRY_ADDRESS,
    EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY,
    SERVER_PRIVATE_KEY: process.env.SERVER_PRIVATE_KEY,
    AGENT_ENDPOINT: process.env.AGENT_ENDPOINT,
    AGENT_CAPABILITIES: process.env.AGENT_CAPABILITIES,
    AGENT_PRICE: process.env.AGENT_PRICE,
    AGENT_ASSET: process.env.AGENT_ASSET,
    RPC_URL: process.env.RPC_URL,
  })

  const privateKey = env.EVM_PRIVATE_KEY ?? env.SERVER_PRIVATE_KEY
  if (!privateKey) {
    throw new Error('EVM_PRIVATE_KEY or SERVER_PRIVATE_KEY required in .env')
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const capabilities = normalizeCapabilities(env.AGENT_CAPABILITIES)
  const capIds = capabilities.map((cap) => keccak256(toHex(cap)))
  const asset = (env.AGENT_ASSET ?? USDT0_MAINNET.address) as `0x${string}`
  const rawPrice = toRawPrice(env.AGENT_PRICE)

  console.log('[registry-cli] registering agent')
  console.log('  endpoint:', env.AGENT_ENDPOINT)
  console.log('  wallet:', account.address)
  console.log('  asset:', asset)
  console.log('  price:', `${env.AGENT_PRICE} USDT0 (raw=${rawPrice})`)
  console.log('  capabilities:', capabilities.join(', ') || '(none)')

  await checkBazaarMetadata(env.AGENT_ENDPOINT)

  const walletClient = createWalletClient({
    account,
    chain: confluxESpace,
    transport: http(env.RPC_URL),
  })

  const publicClient = createPublicClient({
    chain: confluxESpace,
    transport: http(env.RPC_URL),
  })

  const hash = await walletClient.writeContract({
    address: env.AGENT_REGISTRY_ADDRESS as `0x${string}`,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'registerAgent',
    args: [env.AGENT_ENDPOINT, asset, rawPrice, capIds],
  })

  console.log('[registry-cli] tx submitted:', hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('[registry-cli] tx confirmed:', receipt.blockNumber)
}

main().catch((error) => {
  console.error('[registry-cli] failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
