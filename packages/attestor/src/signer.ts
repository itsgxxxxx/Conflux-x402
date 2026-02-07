import { privateKeyToAccount } from "viem/accounts";
import { keccak256, encodePacked, type Hex } from "viem";
import type { Logger } from "pino";

export class AttestationSigner {
  private account: ReturnType<typeof privateKeyToAccount>;
  private logger: Logger;

  constructor(privateKey: Hex, logger: Logger) {
    this.account = privateKeyToAccount(privateKey);
    this.logger = logger;
  }

  /**
   * Get the public address of the attestor
   */
  getAddress(): string {
    return this.account.address;
  }

  /**
   * Compute domain hash
   */
  computeDomainHash(domain: string): Hex {
    return keccak256(encodePacked(["string"], [domain]));
  }

  /**
   * Compute message hash for signing
   */
  computeMessageHash(
    userAddress: string,
    domainHash: Hex,
    expiry: bigint
  ): Hex {
    return keccak256(
      encodePacked(
        ["address", "bytes32", "uint64"],
        [userAddress as Hex, domainHash, expiry]
      )
    );
  }

  /**
   * Sign an attestation
   */
  async signAttestation(
    userAddress: string,
    domain: string,
    expirySeconds: number
  ): Promise<{
    signature: Hex;
    domainHash: Hex;
    expiry: bigint;
  }> {
    const domainHash = this.computeDomainHash(domain);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + expirySeconds);

    const messageHash = this.computeMessageHash(userAddress, domainHash, expiry);

    this.logger.info(
      {
        userAddress,
        domain,
        domainHash,
        expiry: expiry.toString(),
        messageHash,
      },
      "Signing attestation"
    );

    // Sign the message hash (viem automatically adds EIP-191 prefix)
    const signature = await this.account.signMessage({
      message: { raw: messageHash },
    });

    this.logger.info({ signature }, "Attestation signed");

    return {
      signature,
      domainHash,
      expiry,
    };
  }
}
