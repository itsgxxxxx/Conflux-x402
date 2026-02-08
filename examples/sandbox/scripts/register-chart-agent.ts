import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWalletClient, createPublicClient, http, keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { confluxESpace } from '@conflux-x402/chain-config'
import { USDT0_MAINNET } from '@conflux-x402/chain-config'

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')
dotenv.config({ path: envPath })

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

async function main() {
  const privateKey = process.env.EVM_PRIVATE_KEY || process.env.SERVER_PRIVATE_KEY
  if (!privateKey) {
    console.error('EVM_PRIVATE_KEY or SERVER_PRIVATE_KEY required in .env')
    process.exit(1)
  }

  const registryAddress = process.env.AGENT_REGISTRY_ADDRESS
  if (!registryAddress) {
    console.error('AGENT_REGISTRY_ADDRESS required in .env')
    process.exit(1)
  }

  const serverUrl = process.env.CHART_AGENT_ENDPOINT || process.env.SERVER_URL || 'http://localhost:4021'

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  console.log('Registering chart agent with account:', account.address)

  const walletClient = createWalletClient({
    account,
    chain: confluxESpace,
    transport: http('https://evm.confluxrpc.com'),
  })

  const publicClient = createPublicClient({
    chain: confluxESpace,
    transport: http('https://evm.confluxrpc.com'),
  })

  const capId = keccak256(toHex('chart-generation'))
  console.log('Capability ID (chart-generation):', capId)
  console.log('Endpoint:', serverUrl)
  console.log('Asset:', USDT0_MAINNET.address)
  console.log('Price: 1000 (0.001 USDT0)')

  const hash = await walletClient.writeContract({
    address: registryAddress as `0x${string}`,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'registerAgent',
    args: [serverUrl, USDT0_MAINNET.address, 1000n, [capId]],
  })

  console.log('Transaction submitted:', hash)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Transaction confirmed in block:', receipt.blockNumber)
  console.log('Chart agent registered successfully!')
}

main().catch((error) => {
  console.error('Registration failed:', error)
  process.exit(1)
})
