import { createWalletClient, http, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import { toClientEvmSigner } from '@x402/evm'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { confluxESpace, CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { BuyerAgentConfig } from './config.js'
import type { BazaarResource } from './discovery/bazaar-client.js'
import { logger } from './logger.js'

export function createAgent(config: BuyerAgentConfig) {
  const account = privateKeyToAccount(config.privateKey as `0x${string}`)

  const viemClient = createWalletClient({
    account,
    chain: confluxESpace,
    transport: http(config.rpcUrl),
  }).extend(publicActions)

  const evmSigner = toClientEvmSigner({
    address: account.address,
    signTypedData: (args: unknown) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      viemClient.signTypedData(args as any),
  })

  const client = new x402Client()
  registerExactEvmScheme(client, {
    signer: evmSigner,
    networks: [CONFLUX_ESPACE_MAINNET.caip2Id],
  })

  const fetchWithPay = wrapFetchWithPayment(fetch, client)

  return { account, viemClient, fetchWithPay }
}

export async function callAgent(
  fetchWithPay: typeof fetch,
  resource: BazaarResource,
  queryParams?: Record<string, string>,
): Promise<unknown> {
  const route = resource.routes[0]
  if (!route) {
    throw new Error(`No routes defined for agent ${resource.name}`)
  }

  const params = new URLSearchParams(queryParams)
  const url = `${resource.endpoint.replace(/\/$/, '')}${route.path}?${params}`

  logger.info({ url, agent: resource.name }, '[call] calling agent endpoint')

  const response = await fetchWithPay(url)

  logger.info(
    { status: response.status, agent: resource.name },
    '[call] response received',
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Agent call failed: ${response.status} ${text}`)
  }

  return response.json()
}
