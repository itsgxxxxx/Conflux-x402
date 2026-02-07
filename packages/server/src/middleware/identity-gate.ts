import { logger } from '../logger.js'

/**
 * Identity gate hook — M1: disabled (pass-through).
 * M2 will implement on-chain tag verification here.
 *
 * This is designed to be used as an x402 ProtectedRequestHook
 * via onProtectedRequest on x402HTTPResourceServer.
 */
export async function identityGateHook(
  _context: unknown,
  _routeConfig: unknown,
): Promise<void | { grantAccess: true } | { abort: true; reason: string }> {
  // M1: Identity gate is disabled — always pass through to payment flow
  logger.debug('identity gate: pass-through (disabled in M1)')
  return undefined
}
