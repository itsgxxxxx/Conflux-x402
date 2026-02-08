import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { WalletClient, PublicActions } from 'viem'

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const

export async function getUSDT0Balance(
  viemClient: WalletClient & PublicActions,
  address: `0x${string}`,
): Promise<string> {
  const balance = await viemClient.readContract({
    address: CONFLUX_ESPACE_MAINNET.token.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  })

  // USDT0 has 6 decimals
  const balanceNumber = Number(balance) / 1_000_000
  return balanceNumber.toFixed(6)
}
