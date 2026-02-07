import { z } from "zod";

export const AttestRequestSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  domain: z.string().min(1).max(255),
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
}
