import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { confluxESpace } from '@conflux-x402/chain-config'
import type { FacilitatorConfig } from './config.js'

export function createSigner(config: FacilitatorConfig) {
  const account = privateKeyToAccount(config.privateKey as `0x${string}`)

  const publicClient = createPublicClient({
    chain: confluxESpace,
    transport: http(config.rpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain: confluxESpace,
    transport: http(config.rpcUrl),
  })

  return { account, publicClient, walletClient }
}
