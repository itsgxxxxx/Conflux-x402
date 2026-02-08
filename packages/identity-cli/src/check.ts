import { createPublicClient, http, type Hex } from "viem";
import { confluxESpace } from "@conflux-x402/chain-config";
import chalk from "chalk";

const IDENTITY_REGISTRY_ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getIdentity",
    outputs: [
      { internalType: "bytes32", name: "domainHash", type: "bytes32" },
      { internalType: "uint64", name: "issuedAt", type: "uint64" },
      { internalType: "uint64", name: "expiresAt", type: "uint64" },
      { internalType: "bool", name: "valid", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface CheckOptions {
  address: string;
  rpc: string;
  registry?: string;
}

export async function check(options: CheckOptions) {
  console.log(chalk.bold("\n🔍 Identity Status Check\n"));

  if (!options.registry) {
    console.error(chalk.red("❌ IDENTITY_REGISTRY_ADDRESS not set"));
    process.exit(1);
  }

  try {
    const publicClient = createPublicClient({
      chain: confluxESpace,
      transport: http(options.rpc),
    });

    console.log(chalk.cyan("Address:"), options.address);
    console.log(chalk.cyan("Registry:"), options.registry);
    console.log();

    const identity = await publicClient.readContract({
      address: options.registry as Hex,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getIdentity",
      args: [options.address as Hex],
    });

    const [domainHash, issuedAt, expiresAt, valid] = identity;

    if (domainHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log(chalk.yellow("⚠️  No identity registered for this address"));
      process.exit(0);
    }

    console.log(chalk.bold("Identity Details:"));
    console.log();
    console.log(chalk.cyan("  Domain Hash:"), domainHash);
    console.log(
      chalk.cyan("  Issued At:"),
      new Date(Number(issuedAt) * 1000).toISOString()
    );
    console.log(
      chalk.cyan("  Expires At:"),
      new Date(Number(expiresAt) * 1000).toISOString()
    );
    console.log();

    if (valid) {
      console.log(chalk.green.bold("✅ Identity is VALID"));
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(expiresAt) - now;
      const days = Math.floor(remaining / 86400);
      console.log(chalk.gray(`   (${days} days remaining)`));
    } else {
      console.log(chalk.red.bold("❌ Identity is EXPIRED"));
      console.log(
        chalk.gray("   Please re-register to continue using x402 payments")
      );
    }

    console.log();
  } catch (error) {
    console.error(chalk.red("Error checking identity:"), error);
    process.exit(1);
  }
}
