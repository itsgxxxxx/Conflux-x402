import type { RequestHandler } from 'express'
import { paymentMiddleware, x402ResourceServer } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import type { RouteConfig, RoutesConfig } from '@x402/core/server'
import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'

export interface GateRouteConfigBase {
  enablePayment?: boolean
  description: string
  mimeType?: string
}

export interface LoggerLike {
  info?: (obj: unknown, msg?: string) => void
  warn?: (objOrMsg?: unknown, msg?: string) => void
}

export interface X402MiddlewareOptions<T extends GateRouteConfigBase> {
  facilitatorUrl: string
  evmAddress: string
  routes: Record<string, T>
  paymentEnabled?: boolean
  logger?: LoggerLike
}

export function toX402RoutesConfig<T extends GateRouteConfigBase>(
  routes: Record<string, T>,
  evmAddress: string,
): RoutesConfig {
  const { token } = CONFLUX_ESPACE_MAINNET
  const x402Routes: Record<string, RouteConfig> = {}

  for (const [pattern, route] of Object.entries(routes)) {
    if (!route.enablePayment) continue

    x402Routes[pattern] = {
      accepts: [
        {
          scheme: 'exact',
          payTo: evmAddress,
          network: CONFLUX_ESPACE_MAINNET.caip2Id,
          price: {
            amount: '1000', // 0.001 USDT0 (6 decimals)
            asset: token.address,
            extra: {
              name: token.eip712.name,
              version: token.eip712.version,
            },
          },
        },
      ],
      description: route.description,
      mimeType: route.mimeType ?? 'application/json',
    }
  }

  return x402Routes
}

export function createX402Middleware<T extends GateRouteConfigBase>(
  options: X402MiddlewareOptions<T>,
): RequestHandler | null {
  const {
    facilitatorUrl,
    evmAddress,
    routes,
    paymentEnabled = true,
    logger,
  } = options

  const x402Routes = toX402RoutesConfig(routes, evmAddress)
  logger?.info?.({ routes: Object.keys(x402Routes) }, 'x402 protected routes')

  if (!paymentEnabled) {
    logger?.warn?.('payment middleware DISABLED (PAYMENT_ENABLED=false)')
    return null
  }

  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl })
  const exactEvmScheme = new ExactEvmScheme()
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(CONFLUX_ESPACE_MAINNET.caip2Id, exactEvmScheme)

  logger?.info?.({ facilitatorUrl }, 'x402 payment middleware enabled')

  return paymentMiddleware(x402Routes, resourceServer)
}
