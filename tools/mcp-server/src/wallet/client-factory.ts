import { createWalletClient, http, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import { toClientEvmSigner } from '@x402/evm'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { x402HTTPClient } from '@x402/core/client'
import { confluxESpace, CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { McpConfig } from '../config.js'

let cachedClient: ReturnType<typeof createPaymentClient> | null = null

export function createPaymentClient(config: McpConfig) {
  const account = privateKeyToAccount(config.privateKey as `0x${string}`)

  const viemClient = createWalletClient({
    account,
    chain: confluxESpace,
    transport: http(config.rpcUrl),
  }).extend(publicActions)

  const evmSigner = toClientEvmSigner({
    address: account.address,
    signTypedData: (args: unknown) =>
      viemClient.signTypedData(args as any),
  })

  const client = new x402Client()
  registerExactEvmScheme(client, {
    signer: evmSigner,
    networks: [CONFLUX_ESPACE_MAINNET.caip2Id],
  })

  const httpClient = new x402HTTPClient(client)
  const fetchWithPay = wrapFetchWithPayment(fetch, client)

  return { fetchWithPay, account, client, httpClient, viemClient }
}

export function getPaymentClient(config: McpConfig) {
  if (!cachedClient) {
    cachedClient = createPaymentClient(config)
  }
  return cachedClient
}
