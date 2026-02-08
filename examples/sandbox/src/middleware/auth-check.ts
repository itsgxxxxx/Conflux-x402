import type { Request, Response, NextFunction } from 'express'
import {
  recoverMessageAddress,
  keccak256,
  toBytes,
  encodePacked,
  type PublicClient,
} from 'viem'
import type { ServerConfig } from '../config.js'
import { logger } from '../logger.js'
import { NonceStore } from './nonce-store.js'

const IDENTITY_REGISTRY_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'isValid',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MAX_EXPIRY_WINDOW_S = 60 // reject signatures expiring more than 60s in the future
const ZERO_BODY_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

const nonceStore = new NonceStore()

/**
 * Build the canonical message that the client must sign.
 * Must match the client-side implementation exactly.
 */
function buildCanonicalMessage(params: {
  chainId: number
  host: string
  method: string
  path: string
  bodyHash: string
  nonce: string
  expiry: string
}): string {
  return keccak256(
    encodePacked(
      ['string', 'uint256', 'string', 'string', 'string', 'bytes32', 'string', 'string'],
      [
        'X402-AUTH',
        BigInt(params.chainId),
        params.host,
        params.method,
        params.path,
        params.bodyHash as `0x${string}`,
        params.nonce,
        params.expiry,
      ],
    ),
  )
}

export interface AuthCheckDeps {
  config: ServerConfig
  publicClient: PublicClient
}

export function createAuthCheckMiddleware(deps: AuthCheckDeps) {
  const { config, publicClient } = deps

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip non-protected routes
    if (!req.path.startsWith('/sandbox')) {
      return next()
    }

    // AUTH_MODE=none: no auth required, pass through
    if (config.authMode === 'none') {
      return next()
    }

    // AUTH_MODE=domain_gate: require signature + identity check
    const signature = req.headers['x-auth-signature'] as string | undefined
    const nonce = req.headers['x-auth-nonce'] as string | undefined
    const expiry = req.headers['x-auth-expiry'] as string | undefined

    if (!signature || !nonce || !expiry) {
      logger.warn({ path: req.path }, 'auth: missing required headers')
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Authentication required: missing X-Auth-Signature, X-Auth-Nonce, or X-Auth-Expiry headers',
      })
    }

    // 1. Check expiry
    const expiryS = Number(expiry)
    const nowS = Math.floor(Date.now() / 1000)

    if (Number.isNaN(expiryS)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Invalid X-Auth-Expiry' })
    }

    if (expiryS <= nowS) {
      logger.warn({ expiry: expiryS, now: nowS }, 'auth: signature expired')
      return res.status(403).json({ error: 'Forbidden', message: 'Signature expired' })
    }

    if (expiryS - nowS > MAX_EXPIRY_WINDOW_S) {
      logger.warn({ expiry: expiryS, now: nowS }, 'auth: expiry too far in future')
      return res.status(403).json({ error: 'Forbidden', message: 'Expiry too far in future' })
    }

    // 2. Check nonce replay
    if (nonceStore.has(nonce)) {
      logger.warn({ nonce }, 'auth: nonce replay detected')
      return res.status(403).json({ error: 'Forbidden', message: 'Nonce already used' })
    }

    // 3. Recover payer from signature
    const method = req.method.toUpperCase()
    const path = req.path

    // bodyHash: 0x0 for GET/HEAD, keccak256(body) for others
    let bodyHash = ZERO_BODY_HASH
    if (method !== 'GET' && method !== 'HEAD' && req.body) {
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      bodyHash = keccak256(toBytes(rawBody))
    }

    const host = req.headers.host ?? 'localhost'

    const message = buildCanonicalMessage({
      chainId: config.chainId,
      host,
      method,
      path,
      bodyHash,
      nonce,
      expiry,
    })

    let payer: `0x${string}`
    try {
      payer = await recoverMessageAddress({
        message: { raw: message as `0x${string}` },
        signature: signature as `0x${string}`,
      })
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'auth: signature recovery failed')
      return res.status(403).json({ error: 'Forbidden', message: 'Invalid signature' })
    }

    // 4. Record nonce (TTL = time until expiry)
    const ttlMs = (expiryS - nowS) * 1000
    nonceStore.add(nonce, ttlMs)

    // 5. Check IdentityRegistry on-chain
    try {
      const isValid = await publicClient.readContract({
        address: config.identityRegistryAddress as `0x${string}`,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'isValid',
        args: [payer],
      })

      if (!isValid) {
        logger.warn({ payer }, 'auth: identity not registered or expired')
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Identity not registered or expired',
          payer,
        })
      }
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error), payer }, 'auth: identity check failed')
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Identity verification failed',
      })
    }

    logger.info({ payer, path }, 'auth: identity verified')

    // Store payer in request context for downstream middleware (e.g. refund wrapper)
    if (!req.ctx) req.ctx = {}
    req.ctx.payer = payer

    next()
  }
}

// Export for testing
export { buildCanonicalMessage, NonceStore, ZERO_BODY_HASH }
