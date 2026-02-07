import { randomBytes } from "crypto";
import type { Logger } from "pino";

export interface Challenge {
  code: string;
  address: string;
  domain: string;
  createdAt: number;
}

export class DomainVerifier {
  private challenges: Map<string, Challenge> = new Map();
  private readonly CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private logger: Logger;
  private mockMode: boolean;

  constructor(logger: Logger, mockMode = false) {
    this.logger = logger;
    this.mockMode = mockMode;

    // Clean up expired challenges every minute
    setInterval(() => this.cleanupExpiredChallenges(), 60 * 1000);
  }

  /**
   * Generate a new challenge code for domain verification
   */
  generateChallenge(address: string, domain: string): string {
    const code = `x402-verify-${randomBytes(16).toString("hex")}`;

    this.challenges.set(this.getChallengeKey(address, domain), {
      code,
      address,
      domain,
      createdAt: Date.now(),
    });

    this.logger.info(
      { address, domain, code },
      "Generated verification challenge"
    );

    return code;
  }

  /**
   * Verify domain ownership via HTTP endpoint check
   */
  async verifyDomain(
    address: string,
    domain: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.mockMode) {
      this.logger.info({ address, domain }, "Mock mode: skipping HTTP verification");
      return { success: true };
    }

    const key = this.getChallengeKey(address, domain);
    const challenge = this.challenges.get(key);

    if (!challenge) {
      return {
        success: false,
        error: "No challenge found for this address/domain combination",
      };
    }

    // Check if challenge expired
    if (Date.now() - challenge.createdAt > this.CHALLENGE_EXPIRY_MS) {
      this.challenges.delete(key);
      return { success: false, error: "Challenge expired" };
    }

    try {
      // Construct verification URL
      const verificationUrl = this.getVerificationUrl(domain, address);

      this.logger.info({ url: verificationUrl }, "Fetching verification endpoint");

      // Fetch the endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(verificationUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Conflux-x402-Attestor/1.0",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const body = await response.text();
      const expectedChallenge = challenge.code;

      // Check if response contains the challenge code
      if (body.trim() === expectedChallenge) {
        this.logger.info({ address, domain }, "Domain verification successful");
        this.challenges.delete(key); // Clean up used challenge
        return { success: true };
      } else {
        this.logger.warn(
          { address, domain, expected: expectedChallenge, received: body },
          "Challenge mismatch"
        );
        return {
          success: false,
          error: "Challenge code mismatch",
        };
      }
    } catch (error: any) {
      this.logger.error({ error: error.message, address, domain }, "Verification failed");

      if (error.name === "AbortError") {
        return { success: false, error: "Request timeout" };
      }

      return { success: false, error: error.message || "Verification failed" };
    }
  }

  /**
   * Get challenge for a specific address/domain
   */
  getChallenge(address: string, domain: string): Challenge | undefined {
    return this.challenges.get(this.getChallengeKey(address, domain));
  }

  /**
   * Clean up expired challenges
   */
  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, challenge] of this.challenges.entries()) {
      if (now - challenge.createdAt > this.CHALLENGE_EXPIRY_MS) {
        this.challenges.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug({ count: cleaned }, "Cleaned up expired challenges");
    }
  }

  /**
   * Generate unique key for challenge storage
   */
  private getChallengeKey(address: string, domain: string): string {
    return `${address.toLowerCase()}:${domain.toLowerCase()}`;
  }

  /**
   * Construct verification URL
   */
  private getVerificationUrl(domain: string, address: string): string {
    // Try HTTPS first
    return `https://${domain}/verify?address=${address}`;
  }
}
