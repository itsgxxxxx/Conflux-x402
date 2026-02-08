import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import type { PaymentRequired } from '@x402/core/types'
import { loadClientConfig } from './config.js'
import { createPaymentFetch } from './pay-and-fetch.js'
import { logger } from './logger.js'

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')
dotenv.config({ path: envPath })

function printPaymentRequired(paymentRequired: PaymentRequired): void {
  logger.info(
    {
      x402Version: paymentRequired.x402Version,
      resource: paymentRequired.resource,
      options: paymentRequired.accepts.map((item) => ({
        scheme: item.scheme,
        network: item.network,
        asset: item.asset,
        amount: item.amount,
        payTo: item.payTo,
      })),
    },
    'payment required details',
  )
}

async function confirmPayment(): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await readline.question('Confirm payment and continue? (yes/no): ')
    return ['y', 'yes'].includes(answer.trim().toLowerCase())
  } finally {
    readline.close()
  }
}

async function main() {
  const config = loadClientConfig()
  const { account, httpClient } = createPaymentFetch(config)
  const url = `${config.serverUrl}/sandbox/weather`

  logger.info({ address: account.address, server: config.serverUrl, url }, 'manual client initialized')
  logger.info('step 1: sending unpaid request')

  const firstResponse = await fetch(url)
  logger.info({ status: firstResponse.status }, 'first response received')

  if (firstResponse.status !== 402) {
    const unexpectedBody = await firstResponse.text()
    logger.warn({ status: firstResponse.status, body: unexpectedBody }, 'expected 402 but got different status')
    return
  }

  let responseBody: unknown
  const contentType = firstResponse.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    responseBody = await firstResponse.json()
  } else {
    responseBody = await firstResponse.text()
  }

  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => firstResponse.headers.get(name),
    responseBody,
  )
  printPaymentRequired(paymentRequired)

  const approved = await confirmPayment()
  if (!approved) {
    logger.info('payment cancelled by user')
    return
  }

  logger.info('step 2: creating payment payload')
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired)
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload)

  logger.info('step 3: retrying request with payment signature')
  const paidResponse = await fetch(url, {
    headers: paymentHeaders,
  })

  const paymentResponseHeader = paidResponse.headers.get('payment-response')
  logger.info(
    {
      status: paidResponse.status,
      hasPaymentResponseHeader: Boolean(paymentResponseHeader),
    },
    'paid response received',
  )

  if (paymentResponseHeader) {
    try {
      const settlement = httpClient.getPaymentSettleResponse((name) => paidResponse.headers.get(name))
      logger.info({ settlement }, 'settlement response')
    } catch (error) {
      logger.warn({ error }, 'failed to decode payment response header')
    }
  }

  if (paidResponse.ok) {
    const data = await paidResponse.json()
    logger.info({ data }, 'paid content received')
    return
  }

  const failedBody = await paidResponse.text()
  logger.error({ status: paidResponse.status, body: failedBody }, 'manual payment flow failed')
}

main().catch((error) => {
  logger.error({ error }, 'manual client error')
  process.exit(1)
})
