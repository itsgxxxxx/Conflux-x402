import express from 'express'
import type { Express } from 'express'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { paymentMiddleware } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { x402ResourceServer } from '@x402/express'
import { confluxESpace } from '@conflux-x402/chain-config'
import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { ServerConfig } from './config.js'
import { logger } from './logger.js'
import { registerRoutes } from './routes/index.js'
import { buildRoutes, toX402RoutesConfig } from './routes/config.js'
import { createAuthCheckMiddleware } from './middleware/auth-check.js'
import { createRefundWrapper } from './middleware/refund-wrapper.js'
import type { RouteRefundInfo } from './middleware/refund-wrapper.js'
import { RefundStore } from './refund/refund-store.js'
import { processRefund } from './refund/refund-worker.js'
import type { SendRefundTx } from './refund/refund-worker.js'
import { createRefundRouter } from './routes/refunds.js'

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

export function createApp(config: ServerConfig): Express {
  const app = express()
  app.use(express.json())

  // Build route configs
  const gateRoutes = buildRoutes(config)
  const x402Routes = toX402RoutesConfig(gateRoutes, config)

  logger.info({ routes: Object.keys(x402Routes) }, 'x402 protected routes')

  // Setup auth gate middleware (before x402)
  if (config.authMode !== 'none') {
    const publicClient = createPublicClient({
      chain: confluxESpace,
      transport: http(config.rpcUrl),
    })

    app.use(createAuthCheckMiddleware({ config, publicClient }))

    logger.info(
      { authMode: config.authMode, registryAddress: config.identityRegistryAddress },
      'auth gate enabled',
    )
  } else {
    logger.info('auth gate disabled (AUTH_MODE=none)')
  }

  // Setup refund system
  const refundStore = new RefundStore()

  // Build route refund config map from gate routes
  const routeRefundConfig: Record<string, RouteRefundInfo> = {}
  const { token } = CONFLUX_ESPACE_MAINNET
  for (const [pattern, route] of Object.entries(gateRoutes)) {
    if (route.refund?.enabled !== undefined || config.refundDefault === 'on') {
      routeRefundConfig[pattern] = {
        enabled: route.refund?.enabled ?? (config.refundDefault === 'on'),
        amount: route.amount ?? '0',
        token: token.address,
        network: CONFLUX_ESPACE_MAINNET.caip2Id,
      }
    }
  }

  // Build sendRefundTx function (only if we have a private key)
  let sendRefundTx: SendRefundTx | undefined
  if (config.serverPrivateKey) {
    const account = privateKeyToAccount(config.serverPrivateKey as `0x${string}`)
    const walletClient = createWalletClient({
      account,
      chain: confluxESpace,
      transport: http(config.rpcUrl),
    })

    sendRefundTx = async (payer: string, amount: string, tokenAddress: string) => {
      const hash = await walletClient.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [payer as `0x${string}`, BigInt(amount)],
      })
      return hash
    }
  }

  // Refund wrapper middleware (before x402)
  const enqueueRefund = async (requestId: string) => {
    if (!sendRefundTx) {
      logger.error({ requestId }, 'refund: SERVER_PRIVATE_KEY not configured, cannot refund')
      refundStore.transition(requestId, 'refund_queued', 'refund_failed')
      refundStore.update(requestId, { reason: 'SERVER_PRIVATE_KEY not configured' })
      return
    }
    setImmediate(() => {
      processRefund(refundStore, requestId, sendRefundTx!).catch((err) => {
        logger.error(
          { requestId, error: err instanceof Error ? err.message : String(err) },
          'refund: processRefund error',
        )
      })
    })
  }

  app.use(
    createRefundWrapper({
      store: refundStore,
      routeRefundConfig,
      refundDefault: config.refundDefault,
      enqueueRefund,
    }),
  )

  logger.info(
    { refundDefault: config.refundDefault, refundRoutes: Object.keys(routeRefundConfig) },
    'refund system initialized',
  )

  // Setup x402 payment middleware
  if (config.paymentEnabled) {
    const facilitatorClient = new HTTPFacilitatorClient({
      url: config.facilitatorUrl,
      ...(config.facilitatorApiKey && {
        createAuthHeaders: async () => {
          const h = { 'X-API-Key': config.facilitatorApiKey! }
          return { verify: h, settle: h, supported: h }
        },
      }),
    })

    const exactEvmScheme = new ExactEvmScheme()

    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(CONFLUX_ESPACE_MAINNET.caip2Id, exactEvmScheme)

    app.use(
      paymentMiddleware(
        x402Routes,
        resourceServer,
      ),
    )

    logger.info({ facilitatorUrl: config.facilitatorUrl }, 'x402 payment middleware enabled')
  } else {
    logger.warn('payment middleware DISABLED (PAYMENT_ENABLED=false)')
  }

  // Register business routes
  registerRoutes(app)

  // Register refund query route (always available, no payment/auth needed)
  app.use('/refunds', createRefundRouter(refundStore))

  return app
}
