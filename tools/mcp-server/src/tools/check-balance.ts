import type { McpConfig } from '../config.js'
import { getPaymentClient } from '../wallet/client-factory.js'
import { getUSDT0Balance } from '../wallet/balance.js'

export async function checkBalanceTool(config: McpConfig): Promise<string> {
  try {
    const { account, viemClient } = getPaymentClient(config)
    const balance = await getUSDT0Balance(viemClient, account.address)

    return `Wallet Address: ${account.address}\nUSDT0 Balance: ${balance} USDT0\nNetwork: Conflux eSpace (Chain ID 1030)`
  } catch (error) {
    return `Error checking balance: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}
