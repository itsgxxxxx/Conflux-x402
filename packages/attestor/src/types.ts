import { z } from "zod";

export const VerificationMethodSchema = z.enum(["http", "dns"]);
export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;

export const AttestRequestSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  domain: z.string().min(1).max(255),
  method: VerificationMethodSchema.optional().default("http"),
});

export type AttestRequest = z.infer<typeof AttestRequestSchema>;

export interface AttestResponse {
  signature: string;
  domainHash: string;
  expiry: number;
  challenge: string;
  userAddress: string;
}

export interface Challenge {
  code: string;
  address: string;
  domain: string;
  createdAt: number;
  method: VerificationMethod;
}
