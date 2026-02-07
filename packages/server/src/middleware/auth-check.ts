import type { Request, Response, NextFunction } from 'express';
import type { ServerConfig } from '../config.js';
import { logger } from '../logger.js';

/**
 * Pre-check middleware to intercept authorization failures
 * and return 403 instead of letting x402 middleware return 402
 */
export function createAuthCheckMiddleware(config: ServerConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only check for protected routes
    if (!req.path.startsWith('/sandbox')) {
      return next();
    }

    // Extract payment header if exists
    const paymentHeader = req.headers['payment'];
    if (!paymentHeader) {
      // No payment, let x402 middleware handle 402
      return next();
    }

    try {
      // Quick check with facilitator to see if it's an auth issue
      const response = await fetch(`${config.facilitatorUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentPayload: JSON.parse(paymentHeader as string),
          paymentRequirements: {
            // Dummy requirements for pre-check
            network: 'eip155:1030',
            asset: 'USDT0',
            amount: '0',
            payTo: config.evmAddress,
          },
        }),
      });

      if (response.status === 403) {
        const error = await response.json();
        logger.warn({ path: req.path }, 'authorization check failed');
        return res.status(403).json(error);
      }

      // Pass through to x402 middleware
      next();
    } catch (error) {
      // On error, let x402 middleware handle it
      logger.error({ error }, 'auth check middleware error');
      next();
    }
  };
}
