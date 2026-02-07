import type { ChainConfig, TokenConfig } from './types.js'

export const USDT0_MAINNET: TokenConfig = {
  address: '0xaf37E8B6C9ED7f6318979f56Fc287d76c30847ff',
  decimals: 6,
  eip712: {
    name: 'USDT0',
    version: '1',
  },
} as const

export const CONFLUX_ESPACE_MAINNET: ChainConfig = {
  caip2Id: 'eip155:1030',
  chainId: 1030,
  rpcUrl: 'https://evm.confluxrpc.com',
  token: USDT0_MAINNET,
} as const

export const CONFLUX_ESPACE_TESTNET: ChainConfig = {
  caip2Id: 'eip155:71',
  chainId: 71,
  rpcUrl: 'https://evmtestnet.confluxrpc.com',
  token: USDT0_MAINNET, // No testnet USDT0 deployment exists
} as const
