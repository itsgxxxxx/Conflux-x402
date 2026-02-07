#!/usr/bin/env node

import { Command } from "commander";
import { config } from "dotenv";
import { resolve } from "path";
import { register } from "./register.js";
import { check } from "./check.js";
import { serve } from "./serve.js";
import { submit } from "./submit.js";

// Load environment variables from root
config({ path: resolve(process.cwd(), "../../.env") });

const program = new Command();

program
  .name("x402-identity")
  .description("CLI tool for managing x402 client identities")
  .version("0.1.0");

program
  .command("register")
  .description("Register a new client identity")
  .requiredOption("-d, --domain <domain>", "Domain to verify")
  .option("-a, --address <address>", "Client address (defaults to CLIENT_PRIVATE_KEY from env)")
  .option(
    "-m, --method <method>",
    "Verification method: http or dns",
    "http"
  )
  .option(
    "--attestor <url>",
    "Attestor service URL",
    process.env.ATTESTOR_URL || "http://localhost:3003"
  )
  .option(
    "--rpc <url>",
    "RPC URL",
    process.env.RPC_URL || "https://evm.confluxrpc.com"
  )
  .option(
    "--registry <address>",
    "Identity registry contract address",
    process.env.IDENTITY_REGISTRY_ADDRESS
  )
  .option(
    "--verifier <address>",
    "ZK verifier contract address",
    process.env.ZK_VERIFIER_ADDRESS
  )
  .action(register);

program
  .command("check")
  .description("Check identity registration status")
  .requiredOption("-a, --address <address>", "Address to check")
  .option(
    "--rpc <url>",
    "RPC URL",
    process.env.RPC_URL || "https://evm.confluxrpc.com"
  )
  .option(
    "--registry <address>",
    "Identity registry contract address",
    process.env.IDENTITY_REGISTRY_ADDRESS
  )
  .action(check);

program
  .command("serve")
  .description("Start HTTP server to respond to domain verification challenges")
  .requiredOption("-c, --challenge <code>", "Challenge code to serve")
  .option("-p, --port <port>", "Port to listen on", "8080")
  .action(serve);

program
  .command("submit")
  .description("Submit attestation proof to blockchain (skip verification)")
  .requiredOption("-s, --signature <sig>", "Attestor signature (from /attest response)")
  .requiredOption("-d, --domain-hash <hash>", "Domain hash (from /attest response)")
  .requiredOption("-e, --expiry <timestamp>", "Expiry timestamp (from /attest response)")
  .option("-a, --address <address>", "User address (defaults to CLIENT_PRIVATE_KEY from env)")
  .option(
    "--rpc <url>",
    "RPC URL",
    process.env.RPC_URL || "https://evm.confluxrpc.com"
  )
  .option(
    "--verifier <address>",
    "ZK verifier contract address",
    process.env.ZK_VERIFIER_ADDRESS
  )
  .action(submit);

program.parse();
