import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadClientConfig } from './config.js'
import { createPaymentFetch } from './pay-and-fetch.js'
import { logger } from './logger.js'

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')
dotenv.config({ path: envPath })

const config = loadClientConfig()
const { fetchWithPay, account } = createPaymentFetch(config)

logger.info({ address: account.address, server: config.serverUrl }, 'client initialized')

async function main() {
  const url = `${config.serverUrl}/sandbox/weather`
  logger.info({ url }, 'requesting paid endpoint')

  try {
    const response = await fetchWithPay(url)

    logger.info(
      {
        status: response.status,
        paymentResponse: response.headers.get('payment-response'),
      },
      'response received',
    )

    if (response.ok) {
      const data = await response.json()
      logger.info({ data }, 'paid content received')
    } else {
      const text = await response.text()
      logger.error({ status: response.status, body: text }, 'request failed')
    }
  } catch (error) {
    logger.error({ error }, 'client error')
    process.exit(1)
  }
}

main()
