import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, http, keccak256, toHex } from 'viem'
import { confluxESpace } from '@conflux-x402/chain-config'
import { loadBuyerAgentConfig } from './config.js'
import { logger } from './logger.js'
import { scanForCapability, watchAgentEvents } from './discovery/chain-scanner.js'
import { queryBazaar } from './discovery/bazaar-client.js'
import { createAgent, callAgent } from './agent.js'

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')
dotenv.config({ path: envPath })

const config = loadBuyerAgentConfig()
const CAPABILITY = 'chart-generation'
const CAPABILITY_ID = keccak256(toHex(CAPABILITY)) as `0x${string}`

const publicClient = createPublicClient({
  chain: confluxESpace,
  transport: http(config.rpcUrl),
})

const { account, fetchWithPay } = createAgent(config)
logger.info({ address: account.address }, 'buyer agent initialized')

async function main() {
  // ── Step 1: Chain scan ──
  logger.info('=== Step 1: On-chain discovery (scan registry) ===')
  const agents = await scanForCapability(
    publicClient,
    config.agentRegistryAddress as `0x${string}`,
    CAPABILITY_ID,
  )

  if (agents.length === 0) {
    logger.warn('no agents found with capability "%s" — is the chart agent registered?', CAPABILITY)
    logger.info('hint: run the register-chart-agent script first')
    process.exit(0)
  }

  const selected = agents[0]
  logger.info(
    {
      agentId: selected.agentId,
      endpoint: selected.endpoint,
      price: selected.price.toString(),
    },
    'selected agent from chain scan',
  )

  // ── Step 2: Bazaar query ──
  logger.info('=== Step 2: Bazaar discovery (GET /discovery/resources) ===')
  try {
    const bazaar = await queryBazaar(config.facilitatorUrl, CAPABILITY)

    if (bazaar.resources.length > 0) {
      const resource = bazaar.resources[0]
      logger.info(
        {
          name: resource.name,
          capabilities: resource.capabilities,
          price: resource.accepts.amount,
          routes: resource.routes.length,
        },
        'bazaar resource found',
      )

      // ── Step 3: Call the agent (402 → pay → retry) ──
      logger.info('=== Step 3: Calling agent (402 → pay → retry → 200) ===')
      const result = await callAgent(fetchWithPay, resource, { type: 'bar' })
      logger.info({ result }, 'agent call succeeded')
    } else {
      logger.warn('bazaar returned no resources for capability "%s"', CAPABILITY)
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'bazaar query or agent call failed',
    )
  }

  // ── Step 4: Watch for new events (demo for a few seconds) ──
  logger.info('=== Step 4: Watching for new agent events (10s) ===')
  const unwatch = watchAgentEvents(
    publicClient,
    config.agentRegistryAddress as `0x${string}`,
    (agentId, wallet, endpoint, price) => {
      logger.info({ agentId, wallet, endpoint, price: price.toString() }, 'new agent registered!')
    },
    (agentId) => {
      logger.info({ agentId }, 'agent deactivated')
    },
  )

  await new Promise(resolve => setTimeout(resolve, 10_000))
  unwatch()
  logger.info('event watch stopped, demo complete')
}

main().catch((error) => {
  logger.error({ error }, 'buyer agent error')
  process.exit(1)
})
