import { randomBytes } from "crypto";
import { promises as dns } from "dns";
import type { Logger } from "pino";
import type { VerificationMethod } from "./types.js";

export interface Challenge {
  code: string;
  address: string;
  domain: string;
  createdAt: number;
  method: VerificationMethod;
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
  generateChallenge(address: string, domain: string, method: VerificationMethod = "http"): string {
    const code = `x402-verify-${randomBytes(16).toString("hex")}`;

    this.challenges.set(this.getChallengeKey(address, domain), {
      code,
      address,
      domain,
      createdAt: Date.now(),
      method,
    });

    this.logger.info(
      { address, domain, code, method },
      "Generated verification challenge"
    );

    return code;
  }

  /**
   * Verify domain ownership via HTTP endpoint check or DNS TXT record
   */
  async verifyDomain(
    address: string,
    domain: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.mockMode) {
      this.logger.info({ address, domain }, "Mock mode: skipping verification");
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

    // Choose verification method
    if (challenge.method === "dns") {
      return this.verifyDNS(domain, challenge.code, address, key);
    } else {
      return this.verifyHTTP(domain, challenge.code, address, key);
    }
  }

  /**
   * Verify domain ownership via HTTP endpoint
   */
  private async verifyHTTP(
    domain: string,
    expectedChallenge: string,
    address: string,
    challengeKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const verificationUrl = this.getVerificationUrl(domain, address);
      this.logger.info({ url: verificationUrl }, "Fetching HTTP verification endpoint");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

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

      if (body.trim() === expectedChallenge) {
        this.logger.info({ address, domain }, "HTTP verification successful");
        this.challenges.delete(challengeKey);
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
      this.logger.error({ error: error.message, address, domain }, "HTTP verification failed");

      if (error.name === "AbortError") {
        return { success: false, error: "Request timeout" };
      }

      return { success: false, error: error.message || "Verification failed" };
    }
  }

  /**
   * Verify domain ownership via DNS TXT record
   */
  private async verifyDNS(
    domain: string,
    expectedChallenge: string,
    address: string,
    challengeKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const dnsName = `_x402-verify.${domain}`;
      this.logger.info({ dnsName }, "Querying DNS TXT record");

      // Query TXT records
      const records = await dns.resolveTxt(dnsName);

      // Flatten TXT records (they come as array of arrays)
      const values = records.flat();

      this.logger.debug({ dnsName, records: values }, "DNS TXT records found");

      // Check if any record matches the challenge
      if (values.includes(expectedChallenge)) {
        this.logger.info({ address, domain }, "DNS verification successful");
        this.challenges.delete(challengeKey);
        return { success: true };
      } else {
        this.logger.warn(
          { address, domain, expected: expectedChallenge, found: values },
          "Challenge not found in DNS records"
        );
        return {
          success: false,
          error: "Challenge code not found in DNS TXT records",
        };
      }
    } catch (error: any) {
      this.logger.error({ error: error.message, address, domain }, "DNS verification failed");

      // Handle common DNS errors
      if (error.code === "ENODATA" || error.code === "ENOTFOUND") {
        return {
          success: false,
          error: `DNS TXT record not found for _x402-verify.${domain}`,
        };
      }

      return {
        success: false,
        error: error.message || "DNS verification failed",
      };
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
