import express from "express";
import { config } from "dotenv";
import { pino } from "pino";
import { type Hex } from "viem";
import { AttestRequestSchema, type AttestResponse } from "./types.js";
import { DomainVerifier } from "./verifier.js";
import { AttestationSigner } from "./signer.js";

// Load environment variables
config({ path: "../../.env" });

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
  level: process.env.LOG_LEVEL || "info",
});

// Configuration
const PORT = parseInt(process.env.PORT || "3003", 10);
const ATTESTOR_PRIVATE_KEY = process.env.ATTESTOR_PRIVATE_KEY as Hex;
const DEFAULT_EXPIRY_SECONDS = parseInt(
  process.env.DEFAULT_EXPIRY_SECONDS || "2592000", // 30 days
  10
);
const MOCK_MODE = process.env.MOCK_MODE === "true";

if (!ATTESTOR_PRIVATE_KEY) {
  logger.error("ATTESTOR_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

// Initialize services
const verifier = new DomainVerifier(logger, MOCK_MODE);
const signer = new AttestationSigner(ATTESTOR_PRIVATE_KEY, logger);

const app = express();
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    attestorAddress: signer.getAddress(),
    mockMode: MOCK_MODE,
  });
});

/**
 * POST /attest
 * Request attestation for domain ownership
 *
 * Body:
 *   - address: User's Ethereum address
 *   - domain: Domain to verify
 *   - method: Verification method ("http" or "dns")
 *
 * Response:
 *   - signature: Attestor's signature
 *   - domainHash: keccak256(domain)
 *   - expiry: Unix timestamp
 *   - challenge: Challenge code for verification
 *   - userAddress: Normalized user address
 */
app.post("/attest", async (req, res) => {
  try {
    // Validate request
    const validation = AttestRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: validation.error.errors,
      });
    }

    const { address, domain, method } = validation.data;

    logger.info({ address, domain, method }, "Received attestation request");

    // Verify domain ownership (using existing challenge)
    const verificationResult = await verifier.verifyDomain(address, domain);

    if (!verificationResult.success) {
      logger.warn(
        { address, domain, error: verificationResult.error },
        "Domain verification failed"
      );
      return res.status(400).json({
        error: "Domain verification failed",
        message: verificationResult.error,
      });
    }

    // Sign attestation
    const { signature, domainHash, expiry } = await signer.signAttestation(
      address,
      domain,
      DEFAULT_EXPIRY_SECONDS
    );

    const response: AttestResponse = {
      signature,
      domainHash,
      expiry: Number(expiry),
      challenge: verifier.getChallenge(address, domain)?.code || "",
      userAddress: address,
    };

    logger.info({ address, domain }, "Attestation successful");

    res.json(response);
  } catch (error: any) {
    logger.error({ error: error.message }, "Attestation failed");
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * POST /challenge
 * Get a challenge code without performing verification
 * Useful for users to set up their verification endpoint first
 */
app.post("/challenge", (req, res) => {
  try {
    const validation = AttestRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: validation.error.errors,
      });
    }

    const { address, domain, method } = validation.data;
    const challenge = verifier.generateChallenge(address, domain, method);

    let instructions: string;
    if (method === "dns") {
      instructions = `Add a DNS TXT record:\n  Name: _x402-verify.${domain}\n  Type: TXT\n  Value: ${challenge}`;
    } else {
      instructions = `Place this challenge code at: https://${domain}/verify?address=${address}`;
    }

    res.json({
      challenge,
      address,
      domain,
      method,
      expiresIn: "5 minutes",
      instructions,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Challenge generation failed");
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /challenge/:address/:domain
 * Get existing challenge for an address/domain pair
 */
app.get("/challenge/:address/:domain", (req, res) => {
  const { address, domain } = req.params;

  const challenge = verifier.getChallenge(address, domain);

  if (!challenge) {
    return res.status(404).json({
      error: "No challenge found",
      message: "Generate a new challenge via POST /challenge",
    });
  }

  res.json({
    challenge: challenge.code,
    address: challenge.address,
    domain: challenge.domain,
    createdAt: new Date(challenge.createdAt).toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      attestorAddress: signer.getAddress(),
      mockMode: MOCK_MODE,
    },
    "Attestor service started"
  );
});
