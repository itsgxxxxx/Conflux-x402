import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWalletClient, http, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { x402Facilitator } from '@x402/core/facilitator'
import { toFacilitatorEvmSigner } from '@x402/evm'
import { registerExactEvmScheme } from '@x402/evm/exact/facilitator'
import type { PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse } from '@x402/core/types'
import { confluxESpace } from '@conflux-x402/chain-config'
import { loadConfig } from './config.js'
import { logger } from './logger.js'
import { isAlreadySettled, recordSettlement } from './idempotency.js'
import { isAllowedPayer, checkTransactionLimits, recordFailure, recordSuccessfulPayment, getCircuitBreakerStatus } from './rate-limiter.js'

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')
dotenv.config({ path: envPath })

const config = loadConfig()

logger.info({ network: config.network, verifyOnly: config.verifyOnlyMode }, 'loading facilitator config')

const account = privateKeyToAccount(config.privateKey as `0x${string}`)
logger.info({ address: account.address }, 'facilitator wallet')

const viemClient = createWalletClient({
  account,
  chain: confluxESpace,
  transport: http(config.rpcUrl),
}).extend(publicActions)

const evmSigner = toFacilitatorEvmSigner({
  getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),
  address: account.address,
  readContract: (args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }) =>
    viemClient.readContract({
      ...args,
      args: args.args ?? [],
    }),
  verifyTypedData: (args: {
    address: `0x${string}`
    domain: Record<string, unknown>
    types: Record<string, unknown>
    primaryType: string
    message: Record<string, unknown>
    signature: `0x${string}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) => viemClient.verifyTypedData(args as any),
  writeContract: (args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args: readonly unknown[]
  }) =>
    viemClient.writeContract({
      ...args,
      args: args.args ?? [],
    }),
  sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) =>
    viemClient.sendTransaction(args),
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
    viemClient.waitForTransactionReceipt(args),
})

function extractPayerAddress(paymentPayload: PaymentPayload): string | undefined {
  const payload = paymentPayload.payload as {
    authorization?: { from?: string }
    permit2Authorization?: { from?: string }
  }
  if (typeof payload?.authorization?.from === 'string') {
    return payload.authorization.from
  }
  if (typeof payload?.permit2Authorization?.from === 'string') {
    return payload.permit2Authorization.from
  }
  return undefined
}

function derivePaymentId(paymentPayload: PaymentPayload): string {
  const payload = paymentPayload.payload as {
    authorization?: { nonce?: string }
    permit2Authorization?: { nonce?: string | number }
  }
  const nonce = payload?.authorization?.nonce ?? payload?.permit2Authorization?.nonce
  if (typeof nonce === 'string' || typeof nonce === 'number') {
    return `${paymentPayload.accepted.network}:${paymentPayload.accepted.asset}:${String(nonce)}`
  }
  return JSON.stringify({
    network: paymentPayload.accepted.network,
    asset: paymentPayload.accepted.asset,
    amount: paymentPayload.accepted.amount,
    payload: paymentPayload.payload,
  })
}

const facilitator = new x402Facilitator()
  .onBeforeVerify(async (context) => {
    const payer = extractPayerAddress(context.paymentPayload)
    if (payer && !isAllowedPayer(payer, config)) {
      logger.warn({ payer }, 'payer not in allowlist')
      return { abort: true, reason: 'PAYER_NOT_ALLOWED' }
    }
    logger.info({ payer }, 'verify request received')
  })
  .onAfterVerify(async (context) => {
    logger.info(
      { payer: context.result.payer, isValid: context.result.isValid },
      'verify completed',
    )
  })
  .onVerifyFailure(async (context) => {
    logger.warn({ error: context.error }, 'verify failed')
    recordFailure(config)
  })
  .onBeforeSettle(async (context) => {
    // Verify-only mode
    if (config.verifyOnlyMode) {
      logger.info('verify-only mode: settlement blocked')
      return { abort: true, reason: 'VERIFY_ONLY_MODE' }
    }

    // Idempotency check
    const paymentId = derivePaymentId(context.paymentPayload)
    if (isAlreadySettled(paymentId)) {
      logger.warn({ paymentId }, 'duplicate settlement attempt')
      return { abort: true, reason: 'ALREADY_SETTLED' }
    }

    // Rate limit check
    const payer = extractPayerAddress(context.paymentPayload)
    if (payer) {
      const amountUsd = Number(context.requirements.amount) / 1e6 // USDT0 has 6 decimals
      const limitCheck = checkTransactionLimits(payer, amountUsd, config)
      if (!limitCheck.allowed) {
        logger.warn({ payer, reason: limitCheck.reason }, 'rate limit exceeded')
        return { abort: true, reason: `RATE_LIMIT:${limitCheck.reason}` }
      }
    }

    logger.info({ payer }, 'settlement starting')
  })
  .onAfterSettle(async (context) => {
    const paymentId = derivePaymentId(context.paymentPayload)
    const payer = context.result.payer
    const tx = context.result.transaction
    const network = context.result.network

    recordSettlement(paymentId, network, context.requirements.amount)

    if (payer) {
      const amountUsd = Number(context.requirements.amount) / 1e6
      recordSuccessfulPayment(payer, amountUsd)
    }

    logger.info({ payer, tx, network }, 'settlement completed')
  })
  .onSettleFailure(async (context) => {
    logger.error({ error: context.error }, 'settlement failed')
    recordFailure(config)
  })

registerExactEvmScheme(facilitator, {
  signer: evmSigner,
  networks: config.network,
})

const app = express()
app.use(express.json())

app.post('/verify', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload
      paymentRequirements: PaymentRequirements
    }

    if (!paymentPayload || !paymentRequirements) {
      res.status(400).json({ error: 'Missing paymentPayload or paymentRequirements' })
      return
    }

    const response: VerifyResponse = await facilitator.verify(paymentPayload, paymentRequirements)
    res.json(response)
  } catch (error) {
    logger.error({ error }, 'verify endpoint error')
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/settle', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload
      paymentRequirements: PaymentRequirements
    }

    if (!paymentPayload || !paymentRequirements) {
      res.status(400).json({ error: 'Missing paymentPayload or paymentRequirements' })
      return
    }

    const response: SettleResponse = await facilitator.settle(paymentPayload, paymentRequirements)
    res.json(response)
  } catch (error) {
    logger.error({ error }, 'settle endpoint error')

    if (error instanceof Error && error.message.includes('Settlement aborted:')) {
      res.json({
        success: false,
        errorReason: error.message.replace('Settlement aborted: ', ''),
        transaction: '',
        network: req.body?.paymentPayload?.accepted?.network ?? config.network,
      } as SettleResponse)
      return
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/supported', (_req, res) => {
  try {
    const response = facilitator.getSupported()
    res.json(response)
  } catch (error) {
    logger.error({ error }, 'supported endpoint error')
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/health', (_req, res) => {
  const cb = getCircuitBreakerStatus()
  res.json({
    status: cb.isOpen ? 'degraded' : 'ok',
    verifyOnlyMode: config.verifyOnlyMode,
    circuitBreaker: cb,
    network: config.network,
  })
})

app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      network: config.network,
      verifyOnly: config.verifyOnlyMode,
      allowlist: config.allowedPayerAddresses.length > 0 ? config.allowedPayerAddresses.length : 'disabled',
    },
    'facilitator started',
  )
})
