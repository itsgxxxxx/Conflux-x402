import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
} from '@x402/core/http'
import type { McpConfig } from '../config.js'
import { getPaymentClient } from '../wallet/client-factory.js'
import { recordPayment, getDailyTotal } from '../state/payment-log.js'

interface PayFetchArgs {
  url: string
  method?: string
  body?: string
  headers?: Record<string, string>
  max_payment?: string
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  '[::0]',
])

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
]

function validateUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `Only HTTPS URLs are allowed. Received protocol: ${parsed.protocol}`,
    )
  }

  if (BLOCKED_HOSTNAMES.has(parsed.hostname)) {
    throw new Error(
      `Blocked hostname: requests to ${parsed.hostname} are not allowed`,
    )
  }

  const isPrivate = PRIVATE_IP_PATTERNS.some((pattern) =>
    pattern.test(parsed.hostname),
  )
  if (isPrivate) {
    throw new Error(
      `Blocked hostname: requests to private network ranges are not allowed`,
    )
  }

  return parsed
}

function extractSettlementInfo(response: Response): {
  txHash: string
} {
  const paymentResponseHeader = response.headers.get('payment-response')
  if (!paymentResponseHeader) {
    return { txHash: 'none' }
  }

  try {
    const settlement = decodePaymentResponseHeader(paymentResponseHeader)
    return {
      txHash: settlement.transaction || 'unknown',
    }
  } catch {
    return { txHash: 'unknown' }
  }
}

export async function payFetchTool(
  args: PayFetchArgs,
  config: McpConfig,
): Promise<string> {
  try {
    const { url, method = 'GET', body, headers = {}, max_payment } = args

    const validatedUrl = validateUrl(url)

    // Check daily spending limit
    const dailyTotal = getDailyTotal()
    if (dailyTotal >= config.maxDailySpend) {
      return `Error: Daily spending limit reached (${dailyTotal.toFixed(6)}/${config.maxDailySpend} USDT0)`
    }

    // Determine the effective max payment for this call
    const effectiveMaxPayment = max_payment
      ? parseFloat(max_payment)
      : config.maxPaymentPerCall

    if (Number.isNaN(effectiveMaxPayment) || effectiveMaxPayment <= 0) {
      return `Error: Invalid max_payment value: ${max_payment}`
    }

    // Pre-flight: check the 402 response to validate the requested amount
    // before authorizing the automatic payment flow
    const preflight = await fetch(validatedUrl.toString(), {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    })

    let requestedAmountRaw: string | null = null
    let requestedAmountNumeric: number | null = null

    if (preflight.status === 402) {
      const preflightBody = await preflight.clone().text()
      const parsedAmount = parseRequestedAmount(preflight, preflightBody)
      requestedAmountRaw = parsedAmount.raw
      requestedAmountNumeric = parsedAmount.numeric

      if (
        requestedAmountNumeric !== null &&
        requestedAmountNumeric > effectiveMaxPayment
      ) {
        return (
          `Error: Requested payment amount (${requestedAmountNumeric} USDT0) ` +
          `exceeds max_payment limit (${effectiveMaxPayment} USDT0). ` +
          `Increase max_payment or choose a cheaper endpoint.`
        )
      }
    }

    const { fetchWithPay } = getPaymentClient(config)

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = body
    }

    const response = await fetchWithPay(validatedUrl.toString(), fetchOptions)

    const responseText = await response.text()

    // Extract actual payment info from x402 response headers
    const { txHash } = extractSettlementInfo(response)
    const recordedAmount = requestedAmountRaw ?? '0'

    recordPayment({
      url: validatedUrl.toString(),
      amount: recordedAmount,
      txHash,
      timestamp: new Date().toISOString(),
      status: response.ok ? 'success' : 'failed',
    })

    let result = `Status: ${response.status} ${response.statusText}\n\n`
    result += `Response:\n${responseText}\n\n`
    if (txHash !== 'none') {
      result += `Payment: ${recordedAmount} USDT0\n`
      result += `Transaction: ${txHash}`
    } else {
      result += `Payment: none (no payment required)`
    }

    return result
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

function parseRequestedAmount(
  response: Response,
  bodyText: string,
): { raw: string | null; numeric: number | null } {
  try {
    const paymentRequiredHeader = response.headers.get('payment-required')
    if (paymentRequiredHeader) {
      const paymentRequired =
        decodePaymentRequiredHeader(paymentRequiredHeader)
      if (paymentRequired.accepts?.length > 0) {
        const raw = paymentRequired.accepts[0].amount
        const numeric = parseFloat(raw)
        return {
          raw,
          numeric: Number.isNaN(numeric) ? null : numeric,
        }
      }
    }

    const parsed = JSON.parse(bodyText)
    if (parsed?.accepts?.length > 0) {
      const raw = String(parsed.accepts[0].amount)
      const numeric = parseFloat(raw)
      return {
        raw,
        numeric: Number.isNaN(numeric) ? null : numeric,
      }
    }
  } catch {
    // Unable to parse payment amount from preflight response
  }
  return { raw: null, numeric: null }
}
